import { Column, Entity } from 'typeorm'

import { TimestampedEntity } from '../../shared/base.entity'

/**
 * One login from one device. Rotation changes the hashes in place. No soft
 * delete: `revokedAt` says it is finished with and retention removes it after
 * a week. `createdBy` is not `userId` — an impersonating admin differs.
 */
@Entity({ schema: 'identity', name: 'sessions' })
export class Session extends TimestampedEntity {
  @Column('uuid')
  userId!: string

  @Column('text')
  currentTokenHash!: string

  /** The hash before the last rotation: grace window, and token-reuse detection. */
  @Column('text', { nullable: true })
  previousTokenHash!: string | null

  @Column({ type: 'timestamptz', nullable: true })
  rotatedAt!: Date | null

  @Column('text')
  userAgent!: string

  @Column('inet')
  ipAddress!: string

  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastUsedAt!: Date

  @Column({ type: 'timestamptz' })
  expiresAt!: Date

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null

  /** 'logout' | 'logout_all' | 'password_change' | 'password_reset' | 'token_reuse' | 'admin' */
  @Column('text', { nullable: true })
  revokedReason!: string | null
}
