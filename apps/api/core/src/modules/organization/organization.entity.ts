import { Column, Entity } from 'typeorm'

import { SoftDeletableEntity } from '../../shared/base.entity'

/**
 * The customer's top level. No `org_id` — it would always equal `id`, so
 * OrgScopedRepository scopes this one table on `id`.
 *
 * No `ownerId` either: who created it is `createdBy`, and permission lives in
 * `organization.members.role`.
 */
@Entity({ schema: 'organization', name: 'organizations' })
export class Organization extends SoftDeletableEntity {
  @Column('text')
  name!: string

  @Column('text')
  slug!: string
}
