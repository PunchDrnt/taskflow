import { Column, Entity } from 'typeorm'

import { OrgScopedCreatedEntity } from '../../shared/base.entity'

/**
 * Polymorphic — a person or a whole team — so `assigneeId` has no foreign key
 * and an index does the work. Assigning is creating the row: no `assignedAt`,
 * and unassigning removes it rather than editing it, so there is no
 * `updatedAt`/`updatedBy` either — see `OrgScopedCreatedEntity`.
 */
@Entity({ schema: 'task', name: 'assignees' })
export class Assignee extends OrgScopedCreatedEntity {
  @Column('uuid')
  taskId!: string

  /** 'user' | 'team' — decides which table assigneeId points at. */
  @Column('text')
  assigneeType!: string

  @Column('uuid')
  assigneeId!: string
}
