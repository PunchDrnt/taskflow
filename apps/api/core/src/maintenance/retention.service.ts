import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { LOCK_KEYS, withAdvisoryLock } from '#shared/jobs/advisory-lock'
import { alertsFor } from '#shared/jobs/alert'
import { SYSTEM_USER_ID } from '#shared/system-user'

import { isStorageKey } from '../modules/storage/storage-key'
import { StorageService } from '../modules/storage/storage.service'
import {
  PURGE_BATCH_SIZE,
  resolvePurgeOrder,
  RETENTION_DAYS,
} from './retention.policy'

const alerts = alertsFor('maintenance')

/**
 * Deletes what the retention policy says should no longer exist.
 *
 * Raw cross-org SQL, which is what `OrgScopedRepository` exists to prevent
 * everywhere else — retention is the system's operation, not a tenant's, and
 * set-based deletes keep a ninety-day purge out of Node's memory.
 *
 * No request context out here, so the one statement that writes rather than
 * deletes names `SYSTEM_USER_ID` itself.
 *
 * See docs/01-architecture.md#where-the-retention-jobs-live
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    // `StorageModule` is global: a row deleted here can own an object, and
    // nothing else runs late enough to notice it stopped being referenced.
    private readonly storage: StorageService,
  ) {}

  /**
   * Runs every policy, at most once across the cluster. One failing step does
   * not stop the rest.
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
            alerts.failure(error, { step: name })
          }
        }

        await step('softDeleted', () => this.purgeSoftDeleted())
        await step('anonymisedUsers', () =>
          this.anonymisePendingDeletionUsers(),
        )
        await step('sentOutbox', () => this.purgeSentOutbox())
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
   * Hard-deletes soft-deleted rows past the ninety-day window, children first.
   *
   * A table that fails is logged and stepped over. The case is real: a
   * soft-deleted project whose tasks were not soft-deleted with it cannot be
   * removed (`tasks.project_id` is RESTRICT), and one such row must not stop
   * everything else from ever being purged. It does hold up the rest of its
   * own table, since a batch is one statement.
   *
   * Cascades are left alone — deleting an org ninety days gone takes its
   * projects whether or not they were soft-deleted too.
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
        alerts.failure(error, { table: target.name })
      }
    }

    return total
  }

  /**
   * Strips the personal details from users who asked to be deleted and did not
   * come back, leaving the row so their work still has an author.
   *
   * The clock runs from `deletion_requested_at` — `deleted_at` marks the far
   * end of the window and is set here, by this method. Both halves of each
   * pair are written together because the table CHECKs them.
   *
   * The email unique index is partial on `status <> 'deleted'`, so the address
   * is freed for reuse at the moment it stops being stored.
   */
  async anonymisePendingDeletionUsers(): Promise<number> {
    const result = (await this.dataSource.query(
      // ⚠️ The picture's key is read in a CTE, not by RETURNING. `RETURNING`
      // on an UPDATE hands back the **new** row, and the new row is the one
      // whose `avatar_url` this statement has just set to NULL — so asking it
      // for the key returns nothing, silently, for every user. `victims`
      // snapshots the old values before the write lands on them.
      `WITH victims AS (
         SELECT id, avatar_url
           FROM iam.users
          WHERE status = 'pending_deletion'
            AND deletion_requested_at < now() - make_interval(days => $2)
            AND NOT is_system
            FOR UPDATE
       )
       UPDATE iam.users AS u
          SET email         = 'deleted-' || u.id || '@deleted.invalid',
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
         FROM victims AS v
        WHERE u.id = v.id
      RETURNING v.avatar_url AS "avatarUrl"`,
      [SYSTEM_USER_ID, RETENTION_DAYS.pendingDeletionUser],
      // ⚠️ An UPDATE comes back as `[rows, affectedCount]` whether or not it
      // has a RETURNING clause — the rows half is simply empty without one. A
      // cast straight to the row type therefore type-checks and then counts
      // the tuple, which is 2 for every sweep that anonymised anybody at all.
    )) as [{ avatarUrl: string | null }[], number]

    const [rows, anonymised] = result

    // `RETURNING` rather than the count alone: the picture is the one piece of
    // this person that is not in the database, and this statement is the last
    // moment anything knows where it was. Clearing `avatar_url` and leaving
    // the object is not anonymisation — it is keeping the photograph after
    // burning the name.
    await this.discardAvatars(rows)
    if (anonymised > 0) {
      this.logger.log(
        { anonymised },
        'Anonymised users past their grace period',
      )
    }

    return anonymised
  }

  /**
   * The objects those rows used to point at.
   *
   * One at a time and never fatally: a bucket that is down must not stop a
   * sweep whose database half has already committed, and each failure is
   * logged with its key so it can be removed by hand. External http(s) values
   * are somebody else's picture and are skipped.
   */
  private async discardAvatars(
    rows: { avatarUrl: string | null }[],
  ): Promise<void> {
    for (const { avatarUrl } of rows) {
      if (avatarUrl === null || !isStorageKey(avatarUrl)) continue

      try {
        await this.storage.remove(avatarUrl)
      } catch (error) {
        this.logger.warn(
          { err: error, key: avatarUrl },
          'Could not remove an anonymised user profile picture',
        )
      }
    }
  }

  /**
   * Outbox rows whose message went out a month ago. Named for the table, not
   * for "notifications": `notify.notifications` is the in-app inbox and is a
   * different sweep, which Phase 3 owes.
   */
  async purgeSentOutbox(): Promise<number> {
    return this.deleteInBatches(
      `DELETE FROM notify.outbox
        WHERE ctid IN (
          SELECT ctid FROM notify.outbox
           WHERE status = 'sent'
             AND sent_at < now() - make_interval(days => $1)
           LIMIT ${PURGE_BATCH_SIZE}
        )`,
      [RETENTION_DAYS.sentOutbox],
    )
  }

  /** Revoked or expired. The week of slack is for after-the-fact questions. */
  async purgeFinishedSessions(): Promise<number> {
    return this.deleteInBatches(
      `DELETE FROM iam.sessions
        WHERE ctid IN (
          SELECT ctid FROM iam.sessions
           WHERE greatest(expires_at, coalesce(revoked_at, expires_at))
                 < now() - make_interval(days => $1)
           LIMIT ${PURGE_BATCH_SIZE}
        )`,
      [RETENTION_DAYS.finishedSession],
    )
  }

  /** Valid for thirty minutes, kept a day so a "my link failed" ticket has data. */
  async purgePasswordResetTokens(): Promise<number> {
    return this.deleteInBatches(
      `DELETE FROM iam.password_reset_tokens
        WHERE ctid IN (
          SELECT ctid FROM iam.password_reset_tokens
           WHERE created_at < now() - make_interval(days => $1)
           LIMIT ${PURGE_BATCH_SIZE}
        )`,
      [RETENTION_DAYS.passwordResetToken],
    )
  }

  /**
   * Repeats a batched `DELETE` until it stops filling a batch. Each batch is
   * its own transaction: there is no state to be consistent about, and a sweep
   * cut short simply resumes tomorrow.
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
