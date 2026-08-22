import { Column, Entity } from 'typeorm'

import { SoftDeletableEntity } from '#shared/entity/base.entity'

/**
 * System-level RBAC — our staff, across every org. `SystemRole` in TypeScript
 * though the table is `identity.roles`: unprefixed it collides with the
 * org-level role on `organization.members`. Nothing reads it until Phase 7.
 */
@Entity({ schema: 'identity', name: 'roles' })
export class SystemRole extends SoftDeletableEntity {
  @Column('text')
  name!: string

  @Column('text', { nullable: true })
  description!: string | null
}
