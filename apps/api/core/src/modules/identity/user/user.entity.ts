import { Column, Entity } from 'typeorm'

import { SoftDeletableEntity } from '#shared/entity/base.entity'

/** A person. One belongs to many orgs, which is why identity has no org_id. */
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
   * Start of the thirty-day grace period; set exactly while `status` is
   * `pending_deletion`, enforced by CHECK. Not `deletedAt` — that is a
   * @DeleteDateColumn, so it would hide the row from the queries that
   * recovering the account depends on.
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
