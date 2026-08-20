import { Column, Entity } from 'typeorm'

import { BaseEntity } from '../../shared/base.entity'

/**
 * Who a task is assigned to. Polymorphic — a person or a whole team — so
 * `assigneeId` carries no foreign key and an index does the work instead.
 *
 * Assigning is creating the row, so there is no separate `assignedAt`.
 */
@Entity({ schema: 'task', name: 'assignees' })
export class Assignee extends BaseEntity {
  @Column('uuid')
  taskId!: string

  /** 'user' | 'team' — decides which table assigneeId points at. */
  @Column('text')
  assigneeType!: string

  @Column('uuid')
  assigneeId!: string
}
