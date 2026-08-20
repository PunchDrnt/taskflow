import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SYSTEM_USER_ID } from '../shared/system-user'
import { LOCK_KEYS, withAdvisoryLock } from './advisory-lock'
import {
  PURGE_BATCH_SIZE,
  resolvePurgeOrder,
  RETENTION_DAYS,
} from './retention.policy'

/**
 * Deletes what the retention policy says should no longer exist.
 *
 * Every statement here is raw SQL that crosses organisations, which is exactly
 * what `OrgScopedRepository` exists to prevent everywhere else. That is the
 * point: retention is not a tenant's operation, it is the system's, and
 * expressing it as set-based `DELETE`s rather than loading entities keeps a
 * ninety-day purge from paging a whole table into Node.
 *
 * The audit columns get no help from `AuditColumnsSubscriber` here — there is
 * no request context — so the one statement that writes rather than deletes
 * names `SYSTEM_USER_ID` itself.
 *
 * See .claude/docs/01-architecture.md#retention--each-kind-of-data-has-its-own-lifetime
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name)

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Runs every policy, at most once across the cluster.
   *
   * One failing step does not stop the rest: sessions growing without bound
   * because a project purge hit a foreign key would be a bad trade.
   */
  async run(): Promise<void> {
    const attempt = await withAdvisoryLock(
      this.dataSource,
      LOCK_KEYS.retention,
      async () => {
        const counts: Record<string, number> = {}
        let failed = 0

        const step = async (
          name: string,
          work: () => Promise<number>,
        ): Promise<void> => {
          try {
            counts[name] = await work()
          } catch (error) {
            failed += 1
            this.logger.error(
              { err: error, step: name },
              `Retention step "${name}" failed`,
            )
          }
        }

        await step('softDeleted', () => this.purgeSoftDeleted())
        await step('anonymisedUsers', () =>
          this.anonymisePendingDeletionUsers(),
        )
        await step('sentNotifications', () => this.purgeSentNotifications())
        await step('finishedSessions', () => this.purgeFinishedSessions())
        await step('passwordResetTokens', () => this.purgePasswordResetTokens())

        this.logger.log({ ...counts, failed }, 'Retention sweep finished')
      },
    )

    if (!attempt.ran) {
      this.logger.debug('Retention sweep already running elsewhere; skipped')
    }
  }

  /**
   * Hard-deletes soft-deleted rows once they are past the ninety-day window,
   * children before parents.
   *
   * A table that fails is logged and stepped over rather than allowed to end
   * the sweep. The failure this guards against is real rather than
   * hypothetical: a soft-deleted project whose tasks were somehow not
   * soft-deleted with it cannot be removed, because `tasks.project_id` is
   * RESTRICT. One such row must not mean that nothing anywhere is ever purged
   * again. It does hold up the rest of its own table — the batch is one
   * statement — so the log names the table, and those rows go on the next run
   * once whatever is holding them is dealt with.
   *
   * Cascades are left to do their work. Deleting a soft-deleted organisation
   * takes its projects with it whether or not they were soft-deleted too — the
   * org is ninety days gone, and `ON DELETE CASCADE` is the safety net the
   * schema documents for exactly this.
   */
  async purgeSoftDeleted(): Promise<number> {
    const targets = await resolvePurgeOrder(this.dataSource)
    let total = 0

    for (const target of targets) {
      try {
        const deleted = await this.deleteInBatches(
          `DELETE FROM ${target.qualified}
            WHERE ctid IN (
              SELECT ctid FROM ${target.qualified}
               WHERE deleted_at < now() - make_interval(days => $1)
               LIMIT ${PURGE_BATCH_SIZE}
            )`,
          [RETENTION_DAYS.softDeleted],
        )

        if (deleted > 0) {
          this.logger.debug({ table: target.name, deleted }, 'Purged')
        }
        total += deleted
      } catch (error) {
        this.logger.error(
          { err: error, table: target.name },
          `Could not purge ${target.name}: something outside the ninety-day ` +
            'window still references a row inside it',
        )
      }
    }

    return total
  }

  /**
   * Strips the personal details from users who asked to be deleted and did not
   * come back, leaving the row itself in place so everything they created
   * still has an author.
   *
   * The clock runs from `deletion_requested_at`, which exists only while the
   * status is `pending_deletion` and is set at the moment the person asks.
   * `deleted_at` marks the other end of the window — it is set here, by this
   * method — and `updated_at` would restart the countdown every time anything
   * touched the row.
   *
   * `status = 'deleted'` and `deleted_at` are set together — the table has a
   * CHECK tying them, and another tying `deleted_at` to `deleted_by`. The
   * partial unique index on email excludes deleted rows, so the address is
   * released for reuse at the same moment it stops being stored.
   */
  async anonymisePendingDeletionUsers(): Promise<number> {
    const result = (await this.dataSource.query(
      `UPDATE identity.users
          SET email         = 'deleted-' || id || '@deleted.invalid',
              name          = 'Deleted user',
              nickname      = 'deleted',
              avatar_url    = NULL,
              password_hash = NULL,
              status        = 'deleted',
              -- Cleared as the status moves on: the CHECK ties the two, and
              -- when the request was made is audit.logs' job to remember.
              deletion_requested_at = NULL,
              deleted_at    = now(),
              deleted_by    = $1,
              updated_at    = now(),
              updated_by    = $1
        WHERE status = 'pending_deletion'
          AND deletion_requested_at < now() - make_interval(days => $2)
          AND NOT is_system`,
      [SYSTEM_USER_ID, RETENTION_DAYS.pendingDeletionUser],
    )) as [unknown[], number]

    const anonymised = result[1]
    if (anonymised > 0) {
      this.logger.log(
        { anonymised },
        'Anonymised users past their grace period',
      )
    }

    return anonymised
  }

  /** Notifications delivered a month ago say nothing worth keeping. */
  async purgeSentNotifications(): Promise<number> {
    return this.deleteInBatches(
      `DELETE FROM notify.outbox
        WHERE ctid IN (
          SELECT ctid FROM notify.outbox
           WHERE status = 'sent'
             AND sent_at < now() - make_interval(days => $1)
           LIMIT ${PURGE_BATCH_SIZE}
        )`,
      [RETENTION_DAYS.sentNotification],
    )
  }

  /**
   * Sessions that are revoked or expired. The week of slack is so that "who
   * was logged in when this happened" is still answerable for a few days
   * afterwards; `audit.logs` keeps the permanent record.
   */
  async purgeFinishedSessions(): Promise<number> {
    return this.deleteInBatches(
      `DELETE FROM identity.sessions
        WHERE ctid IN (
          SELECT ctid FROM identity.sessions
           WHERE greatest(expires_at, coalesce(revoked_at, expires_at))
                 < now() - make_interval(days => $1)
           LIMIT ${PURGE_BATCH_SIZE}
        )`,
      [RETENTION_DAYS.finishedSession],
    )
  }

  /**
   * Reset tokens, valid for ten minutes and kept for a day so a support
   * question about a link that did not work has something to look at.
   */
  async purgePasswordResetTokens(): Promise<number> {
    return this.deleteInBatches(
      `DELETE FROM identity.password_reset_tokens
        WHERE ctid IN (
          SELECT ctid FROM identity.password_reset_tokens
           WHERE created_at < now() - make_interval(days => $1)
           LIMIT ${PURGE_BATCH_SIZE}
        )`,
      [RETENTION_DAYS.passwordResetToken],
    )
  }

  /**
   * Repeats a batched `DELETE` until it stops filling a batch.
   *
   * Each batch is its own transaction, so a sweep interrupted halfway leaves
   * the rows it already removed removed — retention has no state to be
   * consistent about, and resuming means running again tomorrow.
   */
  private async deleteInBatches(
    sql: string,
    parameters: unknown[],
  ): Promise<number> {
    let total = 0

    for (;;) {
      const result = (await this.dataSource.query(sql, parameters)) as [
        unknown[],
        number,
      ]
      const deleted = result[1]

      total += deleted
      if (deleted < PURGE_BATCH_SIZE) return total
    }
  }
}
