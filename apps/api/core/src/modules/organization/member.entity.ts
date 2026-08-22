import { Column, Entity } from 'typeorm'

import { OrgScopedEntity } from '#shared/entity/base.entity'

/**
 * Membership of an org. Joining is creating the row, so there is no separate
 * `joinedAt` — that is `createdAt`.
 */
@Entity({ schema: 'organization', name: 'members' })
export class OrganizationMember extends OrgScopedEntity {
  @Column('uuid')
  userId!: string

  /**
   * 'owner' | 'admin' | 'member'. Text, so a new role is not a type migration.
   * "at least one owner" is app-enforced: no single-row constraint can say it.
   */
  @Column('text')
  role!: string
}
