import { Injectable } from '@nestjs/common'

import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'

import { User } from './user.entity'

/** Anything else is deactivated, pending deletion, or gone. */
export const ACTIVE_USER_STATUS = 'active'

/**
 * The one way into `identity.users`. Every other module asks here rather than
 * importing the entity, which is what keeps identity's shape changeable.
 *
 * Every read goes through `queryBuilder.base`, and that is the correct call
 * rather than a deliberate crossing: `identity.users` has no `org_id`, so
 * `withOrg` does not exist on it at all. It is also the only one that could
 * work here — login happens before a request context exists, and `withOrg`
 * would throw looking for an org nobody has chosen yet.
 */
@Injectable()
export class UserService {
  constructor(
    @InjectOrgRepository(User)
    private readonly users: OrgScopedRepository<User>,
  ) {}

  /** `email` is citext, so the case of what was typed does not matter. */
  findByEmail(email: string): Promise<User | null> {
    return this.users.queryBuilder
      .base('user')
      .where('user.email = :email', { email })
      .andWhere('user.deletedAt IS NULL')
      .getOne()
  }

  findById(id: string): Promise<User | null> {
    return this.users.queryBuilder
      .base('user')
      .where('user.id = :id', { id })
      .andWhere('user.deletedAt IS NULL')
      .getOne()
  }

  /**
   * The fields a person may edit about themselves.
   *
   * `email` is deliberately not among them: it is the login identifier and is
   * unique across the system, so changing it needs a confirmation round trip
   * to the new address before it takes effect — Phase 2's flow, not a field on
   * this form.
   *
   * `base('user')` for the same reason every read here uses it, plus one more:
   * `updateById` would narrow the where clause by `orgId`, and this table has
   * no such column. Unlike `setLockoutState` this does move `updated_at` and
   * `updated_by` — a person edited it, which is exactly what those columns are
   * for.
   */
  async updateProfile(
    id: string,
    profile: { name: string; nickname: string; avatarUrl: string | null },
    now = new Date(),
  ): Promise<void> {
    await this.users.queryBuilder
      .base('user')
      .update(User)
      .set({ ...profile, updatedAt: now, updatedBy: id })
      .where('id = :id', { id })
      .andWhere('deleted_at IS NULL')
      .execute()
  }

  /**
   * The lockout counters, written without touching `updated_at`/`updated_by`.
   *
   * They are machine state rather than anything a person edited — the same
   * reasoning as `sessions.last_used_at`. Moving the audit columns on a failed
   * login would also attribute the row's last change to whoever was guessing
   * the password, which is the opposite of what those columns mean.
   */
  async setLockoutState(
    id: string,
    state: { failedLoginAttempts: number; lockedUntil: Date | null },
  ): Promise<void> {
    await this.users.queryBuilder
      .base('user')
      .update(User)
      .set(state)
      .where('id = :id', { id })
      .execute()
  }
}
