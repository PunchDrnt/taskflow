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

  /** A palette token, never a hex value. */
  @Column('text')
  color!: string

  /** 'DEV' — rendered with `Task.number` as DEV-120. Duplicates are allowed. */
  @Column('text')
  keyPrefix!: string

  /**
   * The next number to hand out, bumped in the transaction that creates the
   * task. Not `MAX(number) + 1`, which would reissue a deleted task's number.
   */
  @Column('integer', { default: 1 })
  nextTaskNumber!: number

  /** Hidden from the sidebar, not deleted — so no `archivedBy` beside it. */
  @Column({ type: 'timestamptz', nullable: true })
  archivedAt!: Date | null

  /** Phase 3. NULL turns the stale-task warning off for this project. */
  @Column({ type: 'integer', nullable: true })
  staleAfterDays!: number | null

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
