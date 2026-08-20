import { Column, Entity } from 'typeorm'

import { SoftDeletableEntity } from '../../shared/base.entity'

@Entity({ schema: 'identity', name: 'user_roles' })
export class SystemUserRole extends SoftDeletableEntity {
  @Column('uuid')
  userId!: string

  @Column('uuid')
  roleId!: string

  /**
   * Kept alongside `createdBy`, which it otherwise duplicates, because the two
   * differ on delete: `createdBy` is RESTRICT, so an admin who once granted a
   * role could never be removed, while this is SET NULL and the grant outlives
   * them.
   */
  @Column('uuid', { nullable: true })
  grantedBy!: string | null

  /** Temporary elevation for debugging, expiring on its own. */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null
}
