import { Column, Entity } from 'typeorm'

import { SoftDeletableEntity } from '../../shared/base.entity'

/**
 * A person. Not scoped to an org — one user belongs to many through
 * `organization.members`, which is why the whole identity schema sits outside
 * org scoping.
 */
@Entity({ schema: 'identity', name: 'users' })
export class User extends SoftDeletableEntity {
  /** citext, so `A@x.com` and `a@x.com` collide without a lower() wrapper. */
  @Column('citext')
  email!: string

  /** NULL means this account cannot sign in with a password — the system user. */
  @Column('text', { nullable: true })
  passwordHash!: string | null

  @Column('text')
  name!: string

  /** Thai users go by their nickname; it has to be searchable. */
  @Column('text')
  nickname!: string

  @Column('text', { nullable: true })
  avatarUrl!: string | null

  /** 'active' | 'deactivated' | 'pending_deletion' | 'deleted' */
  @Column('text', { default: 'active' })
  status!: string

  /** Exactly one row may have this set; the database enforces it. */
  @Column('boolean', { default: false })
  isSystem!: boolean

  @Column('boolean', { default: false })
  hasClaimedFreeCredits!: boolean

  @Column('integer', { default: 0 })
  freeOrgCount!: number
}
