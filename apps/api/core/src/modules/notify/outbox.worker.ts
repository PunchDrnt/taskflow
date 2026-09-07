import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Interval } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { LOCK_KEYS, withAdvisoryLock } from '#shared/jobs/advisory-lock'
import { alertsFor } from '#shared/jobs/alert'
import { SYSTEM_USER_ID } from '#shared/system-user'

import type { Env } from '../../config/env'
import { EmailTransport } from './email.transport'
import { renderTemplate } from './templates'

/** Give up after this many tries and leave the row for someone to look at. */
export const MAX_ATTEMPTS = 3
/**
 * The wait before a retry is `60 * 5^attempts`, but `attempts = 0` is claimed
 * immediately rather than waiting, so the schedule a row actually sees is
 * send now, +5 minutes, +25 minutes, then `failed` — two waits, because three
 * attempts leave two gaps. The 60s this constant would give at `attempts = 0`
 * is never used; a notification nobody has tried to send yet should go now.
 */
export const BACKOFF_BASE_SECONDS = 60
const BATCH_SIZE = 20
const EVERY_15_SECONDS = 15_000

const alerts = alertsFor('notify')

interface Claimed {
  id: string
  recipient_email: string
  template: string
  payload_json: Record<string, unknown>
  attempts: number
}

/**
 * Delivers what EmailService queued.
 *
 * Crosses organisations on purpose — it is the system acting, not a tenant —
 * which is why it reads `notify.outbox` in raw SQL rather than through
 * OrgScopedRepository, and why `outbox_pending_idx` leads with `status`
 * instead of `org_id`.
 *
 * At-least-once: a process that dies mid-send leaves the row pending and it
 * goes again. A duplicate notification is the acceptable failure here; the
 * alternative, marking sent before sending, loses them silently.
 */
@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name)
  private readonly enabled: boolean

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly transport: EmailTransport,
    config: ConfigService<Env, true>,
  ) {
    this.enabled = config.get('JOBS_ENABLED', { infer: true })
  }

  @Interval('outbox', EVERY_15_SECONDS)
  async tick(): Promise<void> {
    if (!this.enabled) return

    await withAdvisoryLock(this.dataSource, LOCK_KEYS.outbox, () =>
      this.drain(),
    )
  }

  /** Sends everything currently due. Returns how many went out. */
  async drain(): Promise<number> {
    let sent = 0

    for (;;) {
      const batch = await this.claim(BATCH_SIZE)
      if (batch.length === 0) return sent

      for (const row of batch) {
        if (await this.deliver(row)) sent += 1
      }
    }
  }

  /**
   * Takes the rows that are due, and marks them taken in the same statement.
   *
   * Claiming is a write, not a read, and that is the whole point. A plain
   * `SELECT ... FOR UPDATE SKIP LOCKED` through `dataSource.query()` runs in
   * its own implicit transaction, so the row locks are released the moment it
   * returns — measured: a second connection issuing the same query gets the
   * same rows back, and two workers on that shape sent 23 emails for 12 rows.
   * Inside an `UPDATE` the locks are held for the length of the statement,
   * which is what makes SKIP LOCKED mean anything.
   *
   * Bumping `attempts` here rather than on failure also arms the backoff at
   * the moment of taking: a process that dies mid-send leaves the row pending
   * and waiting its turn, instead of being picked up again 15 seconds later.
   *
   * `attempts` therefore counts attempts made, not failures suffered — a row
   * sent first time carries 1.
   */
  private async claim(limit: number): Promise<Claimed[]> {
    // A SELECT returns the rows; only INSERT/UPDATE/DELETE come back as
    // [rows, affected]. This statement is a SELECT overall.
    const rows = (await this.dataSource.query(
      `WITH claimed AS (
         UPDATE notify.outbox o
            SET attempts = o.attempts + 1, updated_at = now(), updated_by = $3
          WHERE o.id IN (
            SELECT id
              FROM notify.outbox
             WHERE status = 'pending'
               AND channel = 'email'
               AND (
                 attempts = 0
                 OR updated_at < now() - make_interval(
                      secs => $1 * power(5, attempts)::int
                    )
               )
             ORDER BY created_at
             LIMIT $2
             FOR UPDATE SKIP LOCKED
          )
         RETURNING o.id, o.recipient_id, o.template, o.payload_json,
                   o.attempts, o.created_at
       )
       SELECT c.id, u.email::text AS recipient_email, c.template,
              c.payload_json, c.attempts
         FROM claimed c
         -- recipient_id is ON DELETE RESTRICT and iam.users is never
         -- hard-deleted, so this join cannot silently drop a claimed row.
         JOIN iam.users u ON u.id = c.recipient_id
        ORDER BY c.created_at`,
      [BACKOFF_BASE_SECONDS, limit, SYSTEM_USER_ID],
    )) as Claimed[]

    return rows
  }

  private async deliver(row: Claimed): Promise<boolean> {
    try {
      const rendered = renderTemplate(row.template, row.payload_json)
      await this.transport.send({ to: row.recipient_email, ...rendered })

      await this.dataSource.query(
        `UPDATE notify.outbox
            SET status = 'sent', sent_at = now(), last_error = NULL,
                updated_at = now(), updated_by = $2
          WHERE id = $1`,
        [row.id, SYSTEM_USER_ID],
      )
      return true
    } catch (error) {
      await this.recordFailure(row, error)
      return false
    }
  }

  /** `claim` already counted this attempt, so this only records how it went. */
  private async recordFailure(row: Claimed, error: unknown): Promise<void> {
    const giveUp = row.attempts >= MAX_ATTEMPTS
    const message = error instanceof Error ? error.message : String(error)

    await this.dataSource.query(
      `UPDATE notify.outbox
          SET last_error = $2, status = $3, updated_at = now(), updated_by = $4
        WHERE id = $1`,
      [row.id, message, giveUp ? 'failed' : 'pending', SYSTEM_USER_ID],
    )

    this.logger[giveUp ? 'error' : 'warn'](
      { err: error, outboxId: row.id, attempts: row.attempts },
      giveUp
        ? 'Giving up on a notification after the last attempt'
        : 'Notification failed; will retry',
    )

    // 'failed' is terminal: nothing retries it, and the person it was meant
    // for is never told. The log alone would say so at 03:00 to nobody.
    if (giveUp) {
      alerts.failure(error, {
        outboxId: row.id,
        template: row.template,
        attempts: row.attempts,
      })
    }
  }
}
