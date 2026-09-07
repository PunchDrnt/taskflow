import { HttpStatus, Injectable } from '@nestjs/common'

import { AUTH_ERROR_CODES } from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { SYSTEM_USER_ID } from '#shared/system-user'

import { User } from './user.entity'

/** Anything else is deactivated, pending deletion, or gone. */
export const ACTIVE_USER_STATUS = 'active'

/**
 * The one way into `iam.users`. Every other module asks here rather than
 * importing the entity, which is what keeps iam's shape changeable.
 *
 * Every read goes through `queryBuilder.base`, and that is the correct call
 * rather than a deliberate crossing: `iam.users` has no `org_id`, so
 * `withOrg` does not exist on it at all. It is also the only one that could
 * work here — login happens before a request context exists, and `withOrg`
 * would throw looking for an org nobody has chosen yet.
 */
/**
 * Postgres's unique_violation, mapped to the code the screen branches on.
 *
 * Catching the constraint rather than checking first is what makes this
 * race-free: two people claiming one username a millisecond apart both pass a
 * `SELECT`, and only the index can say which of them actually got it. The
 * pre-checks in `register` exist for a different reason — they say *which*
 * field collided before anything is written — and this is the backstop that
 * makes them advisory rather than load-bearing.
 */
const UNIQUE_VIOLATION = '23505'

function rethrowConflict(error: unknown): never {
  const driver = (
    error as { driverError?: { code?: string; constraint?: string } }
  ).driverError

  if (driver?.code === UNIQUE_VIOLATION) {
    if (driver.constraint === 'users_username_unique') {
      throw new ApiException(
        HttpStatus.CONFLICT,
        AUTH_ERROR_CODES.USERNAME_TAKEN,
        'ชื่อผู้ใช้นี้ถูกใช้แล้ว',
      )
    }
    if (driver.constraint === 'users_phone_unique') {
      throw new ApiException(
        HttpStatus.CONFLICT,
        AUTH_ERROR_CODES.PHONE_TAKEN,
        'เบอร์โทรนี้ถูกใช้แล้ว',
      )
    }
    if (driver.constraint === 'users_email_unique') {
      throw new ApiException(
        HttpStatus.CONFLICT,
        AUTH_ERROR_CODES.EMAIL_TAKEN,
        'อีเมลนี้ถูกใช้แล้ว',
      )
    }
  }

  throw error
}

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

  /** Same, for the other login identifier. `username` is citext too. */
  findByUsername(username: string): Promise<User | null> {
    return this.users.queryBuilder
      .base('user')
      .where('user.username = :username', { username })
      .andWhere('user.deletedAt IS NULL')
      .getOne()
  }

  /**
   * Whichever identifier this is. One query, chosen by shape rather than by
   * asking the caller which they typed — a sign-in form with one field is the
   * point, and `@` is the only thing that separates the two alphabets here
   * (a username cannot contain one; the CHECK sees to that).
   */
  findByLogin(login: string): Promise<User | null> {
    return login.includes('@')
      ? this.findByEmail(login)
      : this.findByUsername(login)
  }

  findById(id: string): Promise<User | null> {
    return this.users.queryBuilder
      .base('user')
      .where('user.id = :id', { id })
      .andWhere('user.deletedAt IS NULL')
      .getOne()
  }

  /**
   * Several at once, for a list that has ids and needs names.
   *
   * One query rather than a `findById` per row: a members screen calls this
   * with everyone in the organisation, and the loop version is the N+1 that
   * only shows up once a customer has a hundred people. Order is not promised
   * — callers index by id, because a caller that relied on position would
   * silently pair the wrong name with the wrong row when one id is missing.
   */
  findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return Promise.resolve([])

    return this.users.queryBuilder
      .base('user')
      .where('user.id IN (:...ids)', { ids })
      .andWhere('user.deletedAt IS NULL')
      .getMany()
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
    profile: {
      username: string
      name: string
      nickname: string
      phone: string | null
      avatarUrl: string | null
    },
    now = new Date(),
  ): Promise<void> {
    await this.users.queryBuilder
      .base('user')
      .update(User)
      .set({ ...profile, updatedAt: now, updatedBy: id })
      .where('id = :id', { id })
      .andWhere('deleted_at IS NULL')
      .execute()
      .catch(rethrowConflict)
  }

  /**
   * Creates a person, belonging to no organisation.
   *
   * That is the whole shape of registering here: an account is a person, a
   * membership is somebody adding them. `createdBy` is the system user because
   * there is nobody signed in to attribute it to.
   *
   * The unique index on `email` is partial (`WHERE status <> 'deleted'`), so a
   * duplicate raises rather than being caught by a check here — a check would
   * be a race, and the constraint is what actually holds.
   */
  async create(person: {
    email: string
    username: string
    passwordHash: string
    name: string
    nickname: string
  }): Promise<User> {
    const inserted = await this.users.queryBuilder
      .base('user')
      .insert()
      .into(User)
      .values({
        ...person,
        status: ACTIVE_USER_STATUS,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .returning(['id'])
      .execute()
      .catch(rethrowConflict)

    const id = (inserted.raw as { id: string }[])[0]!.id

    return (await this.findById(id))!
  }

  /**
   * Replaces the stored hash. The caller has already checked whatever had to
   * be true first — the current password, or a valid reset token — because
   * those two paths differ in nothing else and deciding here would mean this
   * method knowing which one it was serving.
   */
  async setPasswordHash(
    id: string,
    passwordHash: string,
    actorId: string,
    now = new Date(),
  ): Promise<void> {
    await this.users.queryBuilder
      .base('user')
      .update(User)
      .set({ passwordHash, updatedAt: now, updatedBy: actorId })
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
