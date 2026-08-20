import { Column, Entity } from 'typeorm'

import { SoftDeletableEntity } from '../../shared/base.entity'

/**
 * System-level RBAC — our own staff, across every org. Named `SystemRole` in
 * TypeScript although the table is `identity.roles`: the schema supplies that
 * context in SQL, but in code it would collide with the org-level role, which
 * is a column on `organization.members`.
 *
 * The tables exist from Phase 0; nothing reads them until Phase 7.
 */
@Entity({ schema: 'identity', name: 'roles' })
export class SystemRole extends SoftDeletableEntity {
  @Column('text')
  name!: string

  @Column('text', { nullable: true })
  description!: string | null
}
