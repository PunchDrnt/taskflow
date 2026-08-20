import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Interval } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import type { Env } from '../../config/env'
import { LOCK_KEYS, withAdvisoryLock } from '../../maintenance/advisory-lock'
import { SYSTEM_USER_ID } from '../../shared/system-user'
import { EmailTransport } from './email.transport'
import { renderTemplate } from './templates'

/** Give up after this many tries and leave the row for someone to look at. */
export const MAX_ATTEMPTS = 3
/** 1 minute, then 5, then 25. */
export const BACKOFF_BASE_SECONDS = 60
const BATCH_SIZE = 20
const EVERY_15_SECONDS = 15_000

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
   * Rows that are due, locked so a second worker skips them rather than
   * queueing behind them. The advisory lock already makes that unlikely; this
   * makes a duplicate send impossible rather than improbable.
   */
  private async claim(limit: number): Promise<Claimed[]> {
    // A SELECT returns the rows; only INSERT/UPDATE/DELETE come back as
    // [rows, affected]. Destructuring this one hands back the first row.
    const rows = (await this.dataSource.query(
      `SELECT o.id, u.email::text AS recipient_email, o.template,
              o.payload_json, o.attempts
         FROM notify.outbox o
         JOIN identity.users u ON u.id = o.recipient_id
        WHERE o.status = 'pending'
          AND o.channel = 'email'
          AND (
            o.attempts = 0
            OR o.updated_at < now() - make_interval(
                 secs => $1 * power(5, o.attempts)::int
               )
          )
        ORDER BY o.created_at
        LIMIT $2
        FOR UPDATE OF o SKIP LOCKED`,
      [BACKOFF_BASE_SECONDS, limit],
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

  private async recordFailure(row: Claimed, error: unknown): Promise<void> {
    const attempts = row.attempts + 1
    const giveUp = attempts >= MAX_ATTEMPTS
    const message = error instanceof Error ? error.message : String(error)

    await this.dataSource.query(
      `UPDATE notify.outbox
          SET attempts = $2, last_error = $3, status = $4,
              updated_at = now(), updated_by = $5
        WHERE id = $1`,
      [
        row.id,
        attempts,
        message,
        giveUp ? 'failed' : 'pending',
        SYSTEM_USER_ID,
      ],
    )

    // Sentry replaces this in Phase 0 §7. A row that has given up will not be
    // retried by anything, so it has to be loud now.
    this.logger[giveUp ? 'error' : 'warn'](
      { err: error, outboxId: row.id, attempts },
      giveUp
        ? 'Giving up on a notification after the last attempt'
        : 'Notification failed; will retry',
    )
  }
}
