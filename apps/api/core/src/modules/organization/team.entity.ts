import { Column, Entity } from 'typeorm'

import { BaseEntity } from '../../shared/base.entity'

/**
 * People grouped by how the company is organised. One person can be in many,
 * and a team is not tied to a project.
 */
@Entity({ schema: 'organization', name: 'teams' })
export class Team extends BaseEntity {
  @Column('text')
  name!: string

  @Column('text', { nullable: true })
  description!: string | null
}
