import { Column, Entity } from 'typeorm'

import { BaseEntity } from '../../shared/base.entity'

/**
 * One unit of work, always inside a project, nesting up to MAX_TASK_DEPTH.
 * A sub-task is a full task with its own status and assignees, not a
 * checklist item.
 */
@Entity({ schema: 'task', name: 'tasks' })
export class Task extends BaseEntity {
  @Column('uuid')
  projectId!: string

  @Column('text')
  title!: string

  @Column('text', { nullable: true })
  description!: string | null

  @Column('uuid')
  statusId!: string

  /** 'low' | 'medium' | 'high' | null */
  @Column('text', { nullable: true })
  priority!: string | null

  /** UTC; the frontend renders it in the reader's timezone. */
  @Column({ type: 'timestamptz', nullable: true })
  dueDate!: Date | null

  @Column({ type: 'text', collation: 'C' })
  sortOrder!: string

  @Column('uuid', { nullable: true })
  parentTaskId!: string | null

  /**
   * Derived from the parent on insert. A column rather than a computation so
   * depth limits and "root tasks only" do not need a recursive CTE.
   */
  @Column('integer', { default: 0 })
  depth!: number

  /** Set and cleared together with completedAt; a CHECK enforces it. */
  @Column('uuid', { nullable: true })
  completedBy!: string | null

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null

  /** NULL means Backlog. A sub-task rides its parent's sprint. */
  @Column('uuid', { nullable: true })
  sprintId!: string | null

  /** numeric, so estimates do not drift the way a float would. */
  @Column({ type: 'numeric', nullable: true })
  estimate!: string | null

  /** Keyed by field UUID, not field name, so renaming a field keeps its values. */
  @Column('jsonb', { default: {} })
  customFields!: Record<string, unknown>
}
