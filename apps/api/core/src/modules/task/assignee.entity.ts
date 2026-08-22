import { Column, Entity } from 'typeorm'

import { OrgScopedEntity } from '../../shared/base.entity'

/**
 * Polymorphic — a person or a whole team — so `assigneeId` has no foreign key
 * and an index does the work. Assigning is creating the row: no `assignedAt`.
 */
@Entity({ schema: 'task', name: 'assignees' })
export class Assignee extends OrgScopedEntity {
  @Column('uuid')
  taskId!: string

  /** 'user' | 'team' — decides which table assigneeId points at. */
  @Column('text')
  assigneeType!: string

  @Column('uuid')
  assigneeId!: string
}
