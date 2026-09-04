import type { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { IsNull, type DataSource } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { changePasswordSchema, updateProfileSchema } from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { createOrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { SYSTEM_USER_ID } from '#shared/system-user'

import type { Env } from '../src/config/env'
import { AuthService } from '../src/modules/identity/auth/auth.service'
import { LockoutService } from '../src/modules/identity/auth/lockout.service'
import { PasswordService } from '../src/modules/identity/auth/password.service'
import { Session } from '../src/modules/identity/auth/session.entity'
import { SessionService } from '../src/modules/identity/auth/session.service'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  TokenService,
} from '../src/modules/identity/auth/token.service'
import { User } from '../src/modules/identity/user/user.entity'
import { UserService } from '../src/modules/identity/user/user.service'
import { OrganizationMember } from '../src/modules/organization/member.entity'
import { MembershipService } from '../src/modules/organization/membership.service'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

const PASSWORD = 'correct horse battery staple'
const NEW_PASSWORD = 'a different long password'
const ORIGIN = { userAgent: 'vitest', ipAddress: '127.0.0.1' }

/**
 * What a person can change about their own account: the profile here, and the
 * two password paths that follow it.
 *
 * Separate from `auth.spec.ts` because the question is different — that file
 * asks whether somebody may get in, this one asks what they may change once
 * they are in.
 */
describe.skipIf(!hasTestDatabase)('account', () => {
  let dataSource: DataSource
  let users: UserService
  let sessions: SessionService
  let auth: AuthService
  let counter = 0

  const newUser = async (withPassword = false): Promise<string> => {
    counter += 1
    const hash = withPassword
      ? await new PasswordService().hash(PASSWORD)
      : null
    const [user] = (await dataSource.query(
      `INSERT INTO identity.users
         (email, password_hash, name, nickname, status, created_by, updated_by)
       VALUES ($1, $2, $3, $3, 'active', $4, $4) RETURNING id`,
      [
        `account-${counter}@example.test`,
        hash,
        `user-${counter}`,
        SYSTEM_USER_ID,
      ],
    )) as { id: string }[]

    return user!.id
  }

  /** A signed-in device. Returns the session id the guard would have put in
   * the request context. */
  const newSession = async (userId: string): Promise<string> => {
    const token = new TokenService(
      new JwtService({ secret: 'x'.repeat(32) }),
    ).createRefreshToken()

    const session = await sessions.create(
      userId,
      new TokenService(
        new JwtService({ secret: 'x'.repeat(32) }),
      ).hashRefreshToken(token),
      ORIGIN,
      false,
    )

    return session.id
  }

  const liveSessionCount = async (userId: string): Promise<number> =>
    dataSource.getRepository(Session).countBy({ userId, revokedAt: IsNull() })

  /** The row itself, so the assertions read columns rather than a return value. */
  const rowOf = (id: string): Promise<User | null> =>
    dataSource.getRepository(User).findOneBy({ id })

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()
    users = new UserService(createOrgScopedRepository(dataSource, User))
    sessions = new SessionService(
      createOrgScopedRepository(dataSource, Session),
    )

    const config = {
      get: (key: keyof Env) => (key === 'LOGIN_MAX_ATTEMPTS' ? 5 : 15),
    } as unknown as ConfigService<Env, true>

    auth = new AuthService(
      users,
      new MembershipService(
        createOrgScopedRepository(dataSource, OrganizationMember),
      ),
      sessions,
      new LockoutService(config, users),
      new PasswordService(),
      new TokenService(
        new JwtService({
          secret: 'test-secret-at-least-thirty-two-characters',
          signOptions: {
            algorithm: 'HS256',
            expiresIn: ACCESS_TOKEN_TTL_SECONDS,
          },
          verifyOptions: { algorithms: ['HS256'] },
        }),
      ),
    )
  })

  afterAll(async () => {
    await dataSource?.destroy()
  })

  /** The `code` of the ApiException a call threw, for asserting on the branch. */
  const codeOf = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise
      return 'did not throw'
    } catch (error) {
      return error instanceof ApiException ? error.code : String(error)
    }
  }

  describe('profile', () => {
    it('writes the three editable fields', async () => {
      const id = await newUser()

      await users.updateProfile(id, {
        name: 'Anong Wattana',
        nickname: 'หนึ่ง',
        avatarUrl: 'https://cdn.example.test/a.png',
      })

      expect(await rowOf(id)).toMatchObject({
        name: 'Anong Wattana',
        nickname: 'หนึ่ง',
        avatarUrl: 'https://cdn.example.test/a.png',
      })
    })

    it('clears the avatar with null rather than leaving the old one', async () => {
      const id = await newUser()
      await users.updateProfile(id, {
        name: 'a',
        nickname: 'a',
        avatarUrl: 'https://cdn.example.test/a.png',
      })

      await users.updateProfile(id, {
        name: 'a',
        nickname: 'a',
        avatarUrl: null,
      })

      expect((await rowOf(id))?.avatarUrl).toBeNull()
    })

    it('moves updated_at and updated_by, unlike the lockout counters', async () => {
      // The distinction UserService draws on purpose: a person edited this,
      // so the audit columns follow. `setLockoutState` leaves them alone.
      const id = await newUser()
      const before = await rowOf(id)

      await users.updateProfile(
        id,
        { name: 'b', nickname: 'b', avatarUrl: null },
        new Date(Date.now() + 60_000),
      )

      const after = await rowOf(id)
      expect(after!.updatedBy).toBe(id)
      expect(after!.updatedAt.getTime()).toBeGreaterThan(
        before!.updatedAt.getTime(),
      )
    })

    it('does not touch a soft-deleted row', async () => {
      const id = await newUser()
      await dataSource.query(
        `UPDATE identity.users
            SET status = 'deleted', deleted_at = now(), deleted_by = $2
          WHERE id = $1`,
        [id, SYSTEM_USER_ID],
      )

      await users.updateProfile(id, {
        name: 'ghost',
        nickname: 'ghost',
        avatarUrl: null,
      })

      expect((await rowOf(id))?.name).not.toBe('ghost')
    })
  })

  describe('change password', () => {
    it('signs every other device out and keeps the caller signed in', async () => {
      // The asymmetry is the whole design: the reason to change a password is
      // usually that somebody else might know it, so the sessions it could
      // have opened have to go — but ending the caller's own would answer a
      // successful change with a login screen.
      const id = await newUser(true)
      const mine = await newSession(id)
      await newSession(id)
      await newSession(id)

      const result = await auth.changePassword(id, mine, {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmNewPassword: NEW_PASSWORD,
      })

      expect(result.signedOutSessions).toBe(2)
      expect(await liveSessionCount(id)).toBe(1)
      expect(await sessions.findLive(mine)).not.toBeNull()
    })

    it('records why those sessions ended', async () => {
      const id = await newUser(true)
      const mine = await newSession(id)
      const other = await newSession(id)

      await auth.changePassword(id, mine, {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmNewPassword: NEW_PASSWORD,
      })

      const row = await dataSource.getRepository(Session).findOneBy({
        id: other,
      })
      expect(row?.revokedReason).toBe('password_changed')
    })

    it('refuses a wrong current password and changes nothing', async () => {
      // Checked even though the caller already holds a valid session: an
      // unlocked laptop is exactly the case this exists for.
      const id = await newUser(true)
      const mine = await newSession(id)
      const before = (await rowOf(id))!.passwordHash

      const code = await codeOf(
        auth.changePassword(id, mine, {
          currentPassword: 'not the password',
          newPassword: NEW_PASSWORD,
          confirmNewPassword: NEW_PASSWORD,
        }),
      )

      expect(code).toBe('WRONG_CURRENT_PASSWORD')
      expect((await rowOf(id))?.passwordHash).toBe(before)
      expect(await liveSessionCount(id)).toBe(1)
    })

    it('refuses an account that has no password at all', async () => {
      // The system user, or an account that only ever signed in through a
      // provider. Treating an absent hash as a match would be a way in.
      const id = await newUser()
      const mine = await newSession(id)

      expect(
        await codeOf(
          auth.changePassword(id, mine, {
            currentPassword: '',
            newPassword: NEW_PASSWORD,
            confirmNewPassword: NEW_PASSWORD,
          }),
        ),
      ).toBe('WRONG_CURRENT_PASSWORD')
    })

    it('leaves the new password usable and the old one not', async () => {
      const id = await newUser(true)
      const mine = await newSession(id)
      const passwords = new PasswordService()

      await auth.changePassword(id, mine, {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmNewPassword: NEW_PASSWORD,
      })

      const stored = (await rowOf(id))!.passwordHash!
      expect(await passwords.verify(stored, NEW_PASSWORD)).toBe(true)
      expect(await passwords.verify(stored, PASSWORD)).toBe(false)
    })
  })

  describe('changePasswordSchema', () => {
    const valid = {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      confirmNewPassword: NEW_PASSWORD,
    }

    it('refuses a mismatched confirmation, on that field', () => {
      const result = changePasswordSchema.safeParse({
        ...valid,
        confirmNewPassword: 'something else',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['confirmNewPassword'])
      }
    })

    it('applies the length rule to the new password only', () => {
      // The current one is whatever the account already has. Rejecting a short
      // current password would lock out anyone whose password predates a
      // tightened policy, and would leak the rule for free.
      expect(
        changePasswordSchema.safeParse({ ...valid, currentPassword: 'a' })
          .success,
      ).toBe(true)
      expect(
        changePasswordSchema.safeParse({
          ...valid,
          newPassword: 'short',
          confirmNewPassword: 'short',
        }).success,
      ).toBe(false)
    })
  })

  describe('updateProfileSchema', () => {
    const valid = { name: 'Somchai', nickname: 'Chai', avatarUrl: null }

    it('trims rather than rejecting padded input', () => {
      const result = updateProfileSchema.parse({
        ...valid,
        name: '  Somchai  ',
      })

      expect(result.name).toBe('Somchai')
    })

    it('refuses a blank nickname, which whitespace alone still is', () => {
      // Thai users are addressed by nickname first, so an empty one makes the
      // person unfindable by what colleagues actually call them.
      expect(
        updateProfileSchema.safeParse({ ...valid, nickname: '   ' }).success,
      ).toBe(false)
    })

    it('refuses an avatar that is not a URL, and accepts null', () => {
      expect(
        updateProfileSchema.safeParse({ ...valid, avatarUrl: 'nope' }).success,
      ).toBe(false)
      expect(updateProfileSchema.safeParse(valid).success).toBe(true)
    })

    it('has no email field, so one sent along is dropped', () => {
      // Changing the login identifier needs a confirmation round trip to the
      // new address; a profile PATCH must not be a back door into it.
      const result = updateProfileSchema.parse({
        ...valid,
        email: 'attacker@example.test',
      })

      expect(result).not.toHaveProperty('email')
    })
  })
})
