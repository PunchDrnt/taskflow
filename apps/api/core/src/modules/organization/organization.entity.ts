import { Column, Entity } from 'typeorm'

import { SoftDeletableEntity } from '../../shared/base.entity'

/**
 * The customer's top level. Everything else hangs off it.
 *
 * Extends SoftDeletableEntity rather than BaseEntity because it has no
 * `org_id` — it would always equal `id`. OrgScopedRepository scopes this one
 * table on `id` instead; see .claude/docs/02-database.md#3-multi-tenancy
 *
 * There is no `ownerId` either: "who created this org" is `createdBy`, and
 * permission lives in `organization.members.role`.
 */
@Entity({ schema: 'organization', name: 'organizations' })
export class Organization extends SoftDeletableEntity {
  @Column('text')
  name!: string

  @Column('text')
  slug!: string
}
