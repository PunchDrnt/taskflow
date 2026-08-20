import { Column, Entity } from 'typeorm'

import { BaseEntity } from '../../shared/base.entity'

/**
 * Membership of a project, independent of teams — a person joins a project
 * the way they join a Slack channel.
 */
@Entity({ schema: 'project', name: 'members' })
export class ProjectMember extends BaseEntity {
  @Column('uuid')
  projectId!: string

  @Column('uuid')
  userId!: string

  /** 'admin' | 'member' */
  @Column('text')
  role!: string
}
