import { Column, Entity } from 'typeorm'

import { BaseEntity } from '#shared/entity/base.entity'

/**
 * A saved way of looking at a project's tasks (Phase 4).
 */
@Entity({ schema: 'view', name: 'views' })
export class View extends BaseEntity {
  @Column('uuid')
  projectId!: string

  @Column('text')
  name!: string

  /** 'table' | 'board' | 'calendar' */
  @Column('text')
  type!: string

  /** NULL means a shared view belonging to the project; a value makes it private. */
  @Column('uuid', { nullable: true })
  ownerId!: string | null

  @Column('jsonb', { default: {} })
  filterJson!: Record<string, unknown>

  @Column('jsonb', { default: {} })
  sortJson!: Record<string, unknown>

  @Column('text', { nullable: true })
  groupBy!: string | null
}
