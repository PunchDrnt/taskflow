import { Column, Entity } from 'typeorm'

import { SoftDeletableEntity } from '../../shared/base.entity'

/**
 * Keys are defined in code for type safety and seeded from a migration; the
 * role → permission mapping lives in the database so it can change without a
 * deploy.
 */
@Entity({ schema: 'identity', name: 'permissions' })
export class SystemPermission extends SoftDeletableEntity {
  /** 'org.read' | 'org.suspend' | 'user.impersonate' | … */
  @Column('text')
  key!: string

  @Column('text', { nullable: true })
  description!: string | null
}
