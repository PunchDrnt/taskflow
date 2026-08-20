import { Column, Entity } from 'typeorm'

import { BaseEntity } from '../../shared/base.entity'

/**
 * Membership of an org. Joining is creating the row, so there is no separate
 * `joinedAt` — that is `createdAt`.
 */
@Entity({ schema: 'organization', name: 'members' })
export class OrganizationMember extends BaseEntity {
  @Column('uuid')
  userId!: string

  /**
   * 'owner' | 'admin' | 'member'. Plain text so adding a role later is not a
   * type migration. An org must always keep at least one owner, which no
   * single-row constraint can express — the application enforces it.
   */
  @Column('text')
  role!: string
}
