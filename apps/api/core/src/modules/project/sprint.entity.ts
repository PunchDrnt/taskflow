import { Column, Entity } from 'typeorm'

import { BaseEntity } from '#shared/entity/base.entity'

/**
 * A work cycle. Optional per project via `sprintEnabled`.
 */
@Entity({ schema: 'project', name: 'sprints' })
export class Sprint extends BaseEntity {
  @Column('uuid')
  projectId!: string

  @Column('text')
  name!: string

  @Column('text', { nullable: true })
  goal!: string | null

  /** Plain dates: a sprint runs for whole days, so a time would make its
   *  boundaries depend on who is reading. */
  @Column('date')
  startDate!: string

  @Column('date')
  endDate!: string

  /** 'planned' | 'active' | 'completed'. At most one active per project. */
  @Column('text', { default: 'planned' })
  status!: string

  @Column({ type: 'text', collation: 'C' })
  sortOrder!: string
}
