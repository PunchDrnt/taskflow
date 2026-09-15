import { Column, Entity } from 'typeorm'

import { TimestampedEntity } from '#shared/entity/base.entity'

/**
 * `bigint` arrives from node-postgres as a string, because a Postgres bigint
 * does not fit a JS number in general. A TOTP step is `epochSeconds / 30`,
 * which stays inside `Number.MAX_SAFE_INTEGER` until the year nine billion, so
 * the narrowing is safe here and stated rather than assumed.
 */
const bigintAsNumber = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null ? null : Number(value),
}

/**
 * One person's second factor. Absent for everybody who has not turned it on,
 * which is why it is a table rather than columns on `iam.users`: most rows
 * would be null, and the secret would come back with every ordinary read of a
 * user.
 *
 * Hard delete — turning 2FA off leaves nothing behind. A soft-deleted row is a
 * factor that a query forgetting `deleted_at IS NULL` would keep enforcing
 * after somebody switched it off, which is the same trap `OauthAccount`
 * avoids the same way.
 */
@Entity({ schema: 'iam', name: 'totp_credentials' })
export class TotpCredential extends TimestampedEntity {
  @Column('uuid')
  userId!: string

  /** AES-256-GCM, never the raw base32 — see TotpService. */
  @Column('text')
  secretEncrypted!: string

  /**
   * Null until a code from this secret has been typed back. An unconfirmed
   * credential is never enforced: it would otherwise lock out anybody who
   * opened the setup screen and closed the tab.
   */
  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null

  /**
   * The last accepted 30-second step. A code is valid for its whole window, so
   * without this one shoulder-surfed code can be replayed inside it.
   */
  @Column({ type: 'bigint', nullable: true, transformer: bigintAsNumber })
  lastUsedStep!: number | null

  @Column('integer', { default: 0 })
  failedAttempts!: number

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null
}
