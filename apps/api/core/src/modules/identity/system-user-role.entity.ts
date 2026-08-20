import { Column, Entity } from 'typeorm'

import { SoftDeletableEntity } from '../../shared/base.entity'

@Entity({ schema: 'identity', name: 'user_roles' })
export class SystemUserRole extends SoftDeletableEntity {
  @Column('uuid')
  userId!: string

  @Column('uuid')
  roleId!: string

  /**
   * Duplicates `createdBy` except on delete: that one is RESTRICT, this is SET
   * NULL, so the grant outlives the admin who made it.
   */
  @Column('uuid', { nullable: true })
  grantedBy!: string | null

  /** Temporary elevation for debugging, expiring on its own. */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null
}
