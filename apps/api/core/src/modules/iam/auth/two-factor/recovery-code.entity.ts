import { Column, Entity } from 'typeorm'

import { TimestampedEntity } from '#shared/entity/base.entity'

/**
 * The way back in when the phone is gone. Ten are issued when 2FA is switched
 * on and shown exactly once; only their hashes are kept, because at the moment
 * one is used it is as good as the password.
 *
 * `usedAt` says a code is spent, so there is no `deleted_at` — the same shape
 * as `PasswordResetToken`.
 */
@Entity({ schema: 'iam', name: 'recovery_codes' })
export class RecoveryCode extends TimestampedEntity {
  @Column('uuid')
  userId!: string

  @Column('text')
  codeHash!: string

  @Column({ type: 'timestamptz', nullable: true })
  usedAt!: Date | null
}
