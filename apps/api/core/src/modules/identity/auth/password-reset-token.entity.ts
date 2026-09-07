import { Column, Entity } from 'typeorm'

import { TimestampedEntity } from '#shared/entity/base.entity'

/**
 * Single-use, hashed rather than stored, and as long-lived as
 * `PASSWORD_RESET_TTL_MINUTES` says — thirty minutes by default, not the ten
 * this comment used to claim. Single use is the protection that matters; a
 * window too short for somebody reading mail on a phone between meetings just
 * produces repeated requests, which is not safer
 * (docs/04-features/phase-1.md#auth--users).
 *
 * No soft delete: `usedAt` says it is spent, and retention removes the row
 * after a day.
 */
@Entity({ schema: 'identity', name: 'password_reset_tokens' })
export class PasswordResetToken extends TimestampedEntity {
  @Column('uuid')
  userId!: string

  @Column('text')
  tokenHash!: string

  @Column({ type: 'timestamptz' })
  expiresAt!: Date

  @Column({ type: 'timestamptz', nullable: true })
  usedAt!: Date | null
}
