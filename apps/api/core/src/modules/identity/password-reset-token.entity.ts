import { Column, Entity } from 'typeorm'

import { TimestampedEntity } from '../../shared/base.entity'

/**
 * Single-use, ten minutes long, hashed rather than stored. No soft delete:
 * `usedAt` says it is spent and retention removes it after a day.
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
