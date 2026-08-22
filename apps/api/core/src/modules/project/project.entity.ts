import { Column, Entity } from 'typeorm'

import { BaseEntity } from '#shared/entity/base.entity'

/**
 * Where tasks live. Has its own members, independent of teams — closer to a
 * Slack channel than to a department.
 */
@Entity({ schema: 'project', name: 'projects' })
export class Project extends BaseEntity {
  @Column('text')
  name!: string

  @Column('text', { nullable: true })
  description!: string | null

  @Column('text', { nullable: true })
  icon!: string | null

  /** 'anyone' | 'privileged' — who may mark a task done. */
  @Column('text', { default: 'anyone' })
  completionPolicy!: string

  @Column('boolean', { default: false })
  autoCompleteParent!: boolean

  @Column('boolean', { default: false })
  sprintEnabled!: boolean

  /** 'none' | 'point' | 'hour' | 'tshirt' (Phase 4) */
  @Column('text', { default: 'none' })
  estimateUnit!: string
}
