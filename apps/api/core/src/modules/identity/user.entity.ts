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

  /**
   * When the account holder asked to be deleted. Set exactly while `status`
   * is `pending_deletion`, enforced by CHECK, and the column the retention
   * job counts its thirty days from.
   *
   * Not `deletedAt`: that one is a @DeleteDateColumn, so it marks the row as
   * gone from every query — which is the opposite of what the grace period
   * needs, since recovering the account means finding it first.
   */
  @Column({ type: 'timestamptz', nullable: true })
  deletionRequestedAt!: Date | null

  /** Exactly one row may have this set; the database enforces it. */
  @Column('boolean', { default: false })
  isSystem!: boolean

  @Column('boolean', { default: false })
  hasClaimedFreeCredits!: boolean

  @Column('integer', { default: 0 })
  freeOrgCount!: number
}
