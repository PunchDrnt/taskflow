import { Column, Entity } from 'typeorm'

import { OrgScopedEntity } from '../../shared/base.entity'

@Entity({ schema: 'organization', name: 'team_members' })
export class TeamMember extends OrgScopedEntity {
  @Column('uuid')
  teamId!: string

  @Column('uuid')
  userId!: string

  /** 'admin' | 'member' — a team may have several admins. */
  @Column('text')
  role!: string
}
