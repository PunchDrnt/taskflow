import { Column, Entity } from 'typeorm'

import { SoftDeletableEntity } from '#shared/entity/base.entity'

/** A person. One belongs to many orgs, which is why iam has no org_id. */
@Entity({ schema: 'iam', name: 'users' })
export class User extends SoftDeletableEntity {
  /** citext, so `A@x.com` and `a@x.com` collide without a lower() wrapper. */
  @Column('citext')
  email!: string

  /**
   * The other way to sign in. citext like `email`, and stored lower case — a
   * CHECK enforces that, because citext alone would not: it makes `~`
   * case-insensitive too, so the format pattern has to cast to text first.
   *
   * Not `nickname`. This is unique, narrow enough to sit in a URL, and a
   * credential; that one is what colleagues call the person and may repeat.
   */
  @Column('citext')
  username!: string

  /** NULL means this account cannot sign in with a password — the system user. */
  @Column('text', { nullable: true })
  passwordHash!: string | null

  @Column('text')
  name!: string

  /** Thai users go by their nickname; it has to be searchable. */
  @Column('text')
  nickname!: string

  /**
   * Profile data, not a credential — 2FA is TOTP, so nothing authenticates
   * against this. Unique among live accounts all the same: two people sharing
   * a number is a data-entry mistake, not a case to support. Stored E.164
   * (`+66812345678`) so numbers typed in different styles compare at all.
   */
  @Column('text', { nullable: true })
  phone!: string | null

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

  /** Reset by a successful login. Zero is "no failures since the last one". */
  @Column('integer', { default: 0 })
  failedLoginAttempts!: number

  /** Set while the account is locked out; attempts during it do not extend it. */
  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null
}
