import type { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { IsNull, type DataSource } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  changePasswordSchema,
  phoneSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
  usernameSchema,
} from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { createOrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { SYSTEM_USER_ID } from '#shared/system-user'

import type { Env } from '../src/config/env'
import { FeatureService } from '../src/feature/feature.service'
import { AuditService } from '../src/modules/audit/audit.service'
import { AuditLog } from '../src/modules/audit/log.entity'
import { AuthService } from '../src/modules/iam/auth/auth.service'
import { LockoutService } from '../src/modules/iam/auth/lockout.service'
import { PasswordResetToken } from '../src/modules/iam/auth/password-reset-token.entity'
import {
  PASSWORD_RESET_TEMPLATE,
  PasswordResetService,
} from '../src/modules/iam/auth/password-reset.service'
import { PasswordService } from '../src/modules/iam/auth/password.service'
import { RecoveryCode } from '../src/modules/iam/auth/recovery-code.entity'
import { Session } from '../src/modules/iam/auth/session.entity'
import { SessionService } from '../src/modules/iam/auth/session.service'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  TokenService,
} from '../src/modules/iam/auth/token.service'
import { TotpCredential } from '../src/modules/iam/auth/totp-credential.entity'
import { TotpService } from '../src/modules/iam/auth/totp.service'
import { TwoFactorService } from '../src/modules/iam/auth/two-factor.service'
import { User } from '../src/modules/iam/user/user.entity'
import { UserService } from '../src/modules/iam/user/user.service'
import { EmailService } from '../src/modules/notify/email.service'
import { Outbox } from '../src/modules/notify/outbox.entity'
import { OrganizationMember } from '../src/modules/organization/member.entity'
import { MembershipService } from '../src/modules/organization/membership.service'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

const PASSWORD = 'correct horse battery staple'
const NEW_PASSWORD = 'a different long password'
const ORIGIN = { userAgent: 'vitest', ipAddress: '127.0.0.1' }
const RESET_TTL_MINUTES = 30
const RESET_MAX_PER_HOUR = 3

/**
 * What a person can change about their own account: the profile here, and the
 * two password paths that follow it.
 *
 * Separate from `auth.spec.ts` because the question is different — that file
 * asks whether somebody may get in, this one asks what they may change once
 * they are in.
 */
/**
 * The real service, so `login` takes the branch it takes in production. Its
 * own behaviour is covered in two-factor.spec.ts; here it is a dependency, and
 * a stub that always answered "off" would make every login test prove less
 * than it looks like it proves.
 */
function buildTwoFactor(
  dataSource: DataSource,
  users: UserService,
  sessions: SessionService,
): TwoFactorService {
  return new TwoFactorService(
    createOrgScopedRepository(dataSource, TotpCredential),
    createOrgScopedRepository(dataSource, RecoveryCode),
    dataSource,
    users,
    new PasswordService(),
    sessions,
    new TotpService({
      get: () => Buffer.alloc(32, 7).toString('base64'),
    } as unknown as ConfigService<Env, true>),
    {
      get: (key: keyof Env) => (key === 'LOGIN_MAX_ATTEMPTS' ? 5 : 15),
    } as unknown as ConfigService<Env, true>,
  )
}

describe.skipIf(!hasTestDatabase)('account', () => {
  let dataSource: DataSource
  let users: UserService
  let sessions: SessionService
  let auth: AuthService
  let resets: PasswordResetService
  let twoFactor: TwoFactorService
  let counter = 0

  const newUser = async (withPassword = false): Promise<string> => {
    counter += 1
    const hash = withPassword
      ? await new PasswordService().hash(PASSWORD)
      : null
    const [user] = (await dataSource.query(
      `INSERT INTO iam.users
         (email, username, password_hash, name, nickname, status, created_by,
          updated_by)
       VALUES ($1, $2, $3, $4, $4, 'active', $5, $5) RETURNING id`,
      [
        `account-${counter}@example.test`,
        `account_${counter}`,
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

    twoFactor = buildTwoFactor(dataSource, users, sessions)

    auth = new AuthService(
      dataSource,
      users,
      new MembershipService(
        createOrgScopedRepository(dataSource, OrganizationMember),
      ),
      new AuditService(createOrgScopedRepository(dataSource, AuditLog)),
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
      twoFactor,
    )

    const resetConfig = {
      get: (key: keyof Env) => {
        if (key === 'PASSWORD_RESET_TTL_MINUTES') return RESET_TTL_MINUTES
        if (key === 'PASSWORD_RESET_MAX_PER_HOUR') return RESET_MAX_PER_HOUR
        return 'https://app.example.test'
      },
    } as unknown as ConfigService<Env, true>

    resets = new PasswordResetService(
      createOrgScopedRepository(dataSource, PasswordResetToken),
      dataSource,
      users,
      sessions,
      auth,
      new PasswordService(),
      new TokenService(new JwtService({ secret: 'x'.repeat(32) })),
      new EmailService(),
      resetConfig,
    )
  })

  afterAll(async () => {
    await dataSource?.destroy()
  })

  const emailOf = async (id: string): Promise<string> =>
    (await rowOf(id))!.email

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
        username: `renamed_${(counter += 1)}`,
        phone: null,
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
        username: `renamed_${(counter += 1)}`,
        phone: null,
        name: 'a',
        nickname: 'a',
        avatarUrl: 'https://cdn.example.test/a.png',
      })

      await users.updateProfile(id, {
        username: `renamed_${(counter += 1)}`,
        phone: null,
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
        {
          username: `renamed_${(counter += 1)}`,
          name: 'b',
          nickname: 'b',
          phone: null,
          avatarUrl: null,
        },
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
        `UPDATE iam.users
            SET status = 'deleted', deleted_at = now(), deleted_by = $2
          WHERE id = $1`,
        [id, SYSTEM_USER_ID],
      )

      await users.updateProfile(id, {
        username: `renamed_${(counter += 1)}`,
        phone: null,
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

  describe('forgot password', () => {
    /** The link that was mailed, read back out of the queued row. */
    const queuedCodeFor = async (userId: string): Promise<string | null> => {
      const row = await dataSource.getRepository(Outbox).findOne({
        where: { recipientId: userId, template: PASSWORD_RESET_TEMPLATE },
        order: { createdAt: 'DESC' },
      })

      const url = row?.payloadJson.url
      return typeof url === 'string' ? url.split('code=')[1]! : null
    }

    it('queues a mail that belongs to no organisation', async () => {
      // 🔒 The reason notify.outbox.org_id is nullable at all. The recipient
      // may be in several orgs or in none, and a message about their *login*
      // filed under one company would be wrong in both cases.
      const id = await newUser(true)

      await resets.request(await emailOf(id))

      const row = await dataSource.getRepository(Outbox).findOneBy({
        recipientId: id,
      })
      expect(row?.orgId).toBeNull()
      expect(row?.createdBy).toBe(SYSTEM_USER_ID)
      expect(row?.template).toBe(PASSWORD_RESET_TEMPLATE)
    })

    it('says nothing about an address that does not exist', async () => {
      // Not an assertion about a return value — there is none. The property is
      // that no work is visible either way, so the caller cannot use this
      // endpoint to test whether somebody has an account.
      const before = await dataSource.getRepository(Outbox).count()

      await expect(
        resets.request('definitely-nobody@example.test'),
      ).resolves.toBeUndefined()

      expect(await dataSource.getRepository(Outbox).count()).toBe(before)
    })

    it('sends nothing to an account with no password to reset', async () => {
      const id = await newUser()

      await resets.request(await emailOf(id))

      expect(
        await dataSource.getRepository(Outbox).countBy({ recipientId: id }),
      ).toBe(0)
    })

    it('invalidates the previous link when a new one is asked for', async () => {
      const id = await newUser(true)
      const email = await emailOf(id)

      await resets.request(email)
      const first = (await queuedCodeFor(id))!
      await resets.request(email)
      const second = (await queuedCodeFor(id))!

      expect(second).not.toBe(first)
      expect(await codeOf(resets.reset(first, NEW_PASSWORD))).toBe(
        'INVALID_RESET_CODE',
      )
      await expect(resets.reset(second, NEW_PASSWORD)).resolves.toBeDefined()
    })

    it('stops after PASSWORD_RESET_MAX_PER_HOUR, still answering the same', async () => {
      const id = await newUser(true)
      const email = await emailOf(id)

      for (let n = 0; n < RESET_MAX_PER_HOUR + 2; n += 1) {
        await expect(resets.request(email)).resolves.toBeUndefined()
      }

      expect(
        await dataSource.getRepository(Outbox).countBy({ recipientId: id }),
      ).toBe(RESET_MAX_PER_HOUR)
    })

    it('counts the window from the request, so an hour later is allowed again', async () => {
      const id = await newUser(true)
      const email = await emailOf(id)
      const start = new Date()

      for (let n = 0; n < RESET_MAX_PER_HOUR; n += 1) {
        await resets.request(email, start)
      }
      await resets.request(email, start)
      expect(
        await dataSource.getRepository(Outbox).countBy({ recipientId: id }),
      ).toBe(RESET_MAX_PER_HOUR)

      await resets.request(email, new Date(start.getTime() + 61 * 60_000))

      expect(
        await dataSource.getRepository(Outbox).countBy({ recipientId: id }),
      ).toBe(RESET_MAX_PER_HOUR + 1)
    })
  })

  describe('reset password', () => {
    const codeFor = async (id: string): Promise<string> => {
      await resets.request(await emailOf(id))
      const row = await dataSource.getRepository(Outbox).findOne({
        where: { recipientId: id, template: PASSWORD_RESET_TEMPLATE },
        order: { createdAt: 'DESC' },
      })

      return String(row!.payloadJson.url).split('code=')[1]!
    }

    it('sets the password and revokes every session, sparing none', async () => {
      // Unlike a change, which keeps the caller's: here there is no caller to
      // keep, and if the reason for the reset was a break-in then the
      // intruder's session is the one that has to go.
      const id = await newUser(true)
      await newSession(id)
      await newSession(id)
      const code = await codeFor(id)

      const result = await resets.reset(code, NEW_PASSWORD)

      expect(result.signedOutSessions).toBe(2)
      expect(await liveSessionCount(id)).toBe(0)
      expect(
        await new PasswordService().verify(
          (await rowOf(id))!.passwordHash!,
          NEW_PASSWORD,
        ),
      ).toBe(true)
    })

    it('is single use', async () => {
      const id = await newUser(true)
      const code = await codeFor(id)

      await resets.reset(code, NEW_PASSWORD)

      expect(await codeOf(resets.reset(code, 'yet another password'))).toBe(
        'INVALID_RESET_CODE',
      )
    })

    it('refuses a code past its expiry', async () => {
      const id = await newUser(true)
      const code = await codeFor(id)

      const later = new Date(Date.now() + (RESET_TTL_MINUTES + 1) * 60_000)

      expect(await codeOf(resets.reset(code, NEW_PASSWORD, later))).toBe(
        'INVALID_RESET_CODE',
      )
    })

    it('answers a made-up code exactly as it answers a spent one', async () => {
      // One code for wrong, spent and expired, so a guess cannot be told apart
      // from a stale link.
      expect(await codeOf(resets.reset('not-a-real-code', NEW_PASSWORD))).toBe(
        'INVALID_RESET_CODE',
      )
    })

    it('stores a hash, never the code itself', async () => {
      const id = await newUser(true)
      const code = await codeFor(id)

      const row = await dataSource
        .getRepository(PasswordResetToken)
        .findOneBy({ userId: id })

      expect(row!.tokenHash).not.toBe(code)
      expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  describe('resetPasswordSchema', () => {
    it('refuses a mismatched confirmation', () => {
      expect(
        resetPasswordSchema.safeParse({
          code: 'abc',
          newPassword: NEW_PASSWORD,
          confirmNewPassword: 'something else',
        }).success,
      ).toBe(false)
    })

    it('refuses an empty code', () => {
      expect(
        resetPasswordSchema.safeParse({
          code: '',
          newPassword: NEW_PASSWORD,
          confirmNewPassword: NEW_PASSWORD,
        }).success,
      ).toBe(false)
    })
  })

  describe('register', () => {
    it('is off, which is the whole point of the endpoint existing', () => {
      // 🔒 docs/04-features/phase-1.md#auth--users: the route is written now
      // and gated, rather than added later. If this ever reads true by
      // accident, anybody who knows the URL can create an account and wait to
      // be mis-clicked into an organisation.
      expect(new FeatureService().isEnabled(null, 'public_registration')).toBe(
        false,
      )
    })

    it('creates a person who belongs to no organisation', async () => {
      // The service behind the gate, so that flipping the flag one day gets a
      // working endpoint rather than a first bug report.
      const created = await auth.register({
        email: `register-${(counter += 1)}@example.test`,
        username: `register_${counter}`,
        password: PASSWORD,
        confirmPassword: PASSWORD,
        name: 'Somchai Ura',
        nickname: 'Chai',
      })

      const user = await rowOf(created.id)
      expect(user?.nickname).toBe('Chai')
      expect(user?.status).toBe('active')
      expect(user?.createdBy).toBe(SYSTEM_USER_ID)
      expect(
        await dataSource.query(
          `SELECT 1 FROM organization.members WHERE user_id = $1`,
          [created.id],
        ),
      ).toHaveLength(0)
    })

    it('stores a hash of the password, not the password', async () => {
      const created = await auth.register({
        email: `register-${(counter += 1)}@example.test`,
        username: `register_${counter}`,
        password: PASSWORD,
        confirmPassword: PASSWORD,
        name: 'a',
        nickname: 'a',
      })

      const stored = (await rowOf(created.id))!.passwordHash!
      expect(stored).not.toContain(PASSWORD)
      expect(await new PasswordService().verify(stored, PASSWORD)).toBe(true)
    })

    it('refuses an address that already has an account', async () => {
      const email = `register-${(counter += 1)}@example.test`
      const person = {
        email,
        username: `register_${counter}`,
        password: PASSWORD,
        confirmPassword: PASSWORD,
        name: 'a',
        nickname: 'a',
      }

      await auth.register(person)

      expect(await codeOf(auth.register(person))).toBe('EMAIL_TAKEN')
    })
  })

  describe('registerSchema', () => {
    const valid = {
      email: 'someone@example.test',
      username: 'someone',
      password: PASSWORD,
      confirmPassword: PASSWORD,
      name: 'Somchai',
      nickname: 'Chai',
    }

    it('refuses a mismatched confirmation', () => {
      expect(
        registerSchema.safeParse({ ...valid, confirmPassword: 'nope' }).success,
      ).toBe(false)
    })

    it('has no orgId, because registering creates a person not a membership', () => {
      const parsed = registerSchema.parse({ ...valid, orgId: 'anything' })
      expect(parsed).not.toHaveProperty('orgId')
    })

    it('requires a nickname like every other name field here', () => {
      expect(
        registerSchema.safeParse({ ...valid, nickname: ' ' }).success,
      ).toBe(false)
    })
  })

  describe('username and phone', () => {
    it('finds the same person by either identifier', async () => {
      // One sign-in field, and `findByLogin` picks the query from the shape
      // rather than asking which the person typed.
      const id = await newUser(true)
      const email = await emailOf(id)
      const username = (await rowOf(id))!.username

      expect((await users.findByLogin(email))?.id).toBe(id)
      expect((await users.findByLogin(username))?.id).toBe(id)
    })

    it('matches a username whatever case it is typed in', async () => {
      // citext on the column. The CHECK keeps what is *stored* lower case;
      // this is about what someone types into the form at 7am.
      const id = await newUser(true)
      const username = (await rowOf(id))!.username

      expect((await users.findByLogin(username.toUpperCase()))?.id).toBe(id)
    })

    it('refuses a second account on one phone number', async () => {
      // 🔒 Unique among live accounts. Mapped from the constraint rather than
      // checked first, so two requests a millisecond apart cannot both pass.
      const first = await newUser(true)
      const second = await newUser(true)
      const profile = {
        name: 'a',
        nickname: 'a',
        phone: '+66899999999',
        avatarUrl: null,
      }

      await users.updateProfile(first, {
        ...profile,
        username: `phone_a_${(counter += 1)}`,
      })

      expect(
        await codeOf(
          users.updateProfile(second, {
            ...profile,
            username: `phone_b_${(counter += 1)}`,
          }),
        ),
      ).toBe('PHONE_TAKEN')
    })

    it('refuses a username somebody already answers to', async () => {
      const first = await newUser(true)
      const second = await newUser(true)
      const taken = `taken_${(counter += 1)}`

      await users.updateProfile(first, {
        username: taken,
        name: 'a',
        nickname: 'a',
        phone: null,
        avatarUrl: null,
      })

      expect(
        await codeOf(
          users.updateProfile(second, {
            username: taken,
            name: 'a',
            nickname: 'a',
            phone: null,
            avatarUrl: null,
          }),
        ),
      ).toBe('USERNAME_TAKEN')
    })

    it('lets many accounts have no phone at all', async () => {
      // A unique index admits any number of NULLs; most rows will be one.
      const a = await newUser(true)
      const b = await newUser(true)
      const blank = { name: 'a', nickname: 'a', phone: null, avatarUrl: null }

      await users.updateProfile(a, {
        ...blank,
        username: `nophone_a_${(counter += 1)}`,
      })
      await expect(
        users.updateProfile(b, {
          ...blank,
          username: `nophone_b_${(counter += 1)}`,
        }),
      ).resolves.toBeUndefined()
    })
  })

  describe('usernameSchema', () => {
    it('lower-cases rather than rejecting, so the stored form is canonical', () => {
      expect(usernameSchema.parse('  Anong  ')).toBe('anong')
    })

    it('refuses what would have to be escaped in a URL or an @-mention', () => {
      for (const bad of [
        'an ong',
        'an.ong',
        'อนงค์',
        'a',
        'ab',
        '1anong',
        'a'.repeat(31),
      ]) {
        expect(usernameSchema.safeParse(bad).success).toBe(false)
      }
    })

    it('accepts the shapes the CHECK accepts, and no others', () => {
      for (const good of ['anong', 'a_b_c', 'user_01', 'abc']) {
        expect(usernameSchema.safeParse(good).success).toBe(true)
      }
    })
  })

  describe('phoneSchema', () => {
    it('reads a leading zero as Thai, since this is a Thai company', () => {
      expect(phoneSchema.parse('0812345678')).toBe('+66812345678')
    })

    it('normalises the punctuation people actually type', () => {
      for (const typed of ['081-234-5678', '081 234 5678', '(081) 234-5678']) {
        expect(phoneSchema.parse(typed)).toBe('+66812345678')
      }
    })

    it('keeps a number that already says which country it is', () => {
      expect(phoneSchema.parse('+6621234567')).toBe('+6621234567')
      expect(phoneSchema.parse('+14155552671')).toBe('+14155552671')
    })

    it('refuses what is not a phone number', () => {
      for (const bad of ['12345', 'ไม่ใช่เบอร์', '+0812345678', '']) {
        expect(phoneSchema.safeParse(bad).success).toBe(false)
      }
    })
  })

  describe('updateProfileSchema', () => {
    const valid = {
      username: 'somchai',
      name: 'Somchai',
      nickname: 'Chai',
      phone: null,
      avatarUrl: null,
    }

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

    it('takes an avatar as a storage key or as an external URL', () => {
      // ⚠️ This used to require a URL. The bucket is private and stays
      // private, so a URL to an object in it stops working the moment the
      // signature expires — `POST /v1/me/avatar-upload` hands back a key, and
      // `GET /v1/users/:id/avatar` is what turns it into a picture. An
      // ordinary http(s) URL is still accepted for a picture hosted elsewhere.
      for (const avatarUrl of [
        'org-1/avatar/user-1/abc-photo.png',
        'https://cdn.example.test/me.png',
        null,
      ]) {
        expect(
          updateProfileSchema.safeParse({ ...valid, avatarUrl }).success,
        ).toBe(true)
      }
    })

    it('refuses an avatar path that climbs out of its prefix', () => {
      // The key is handed back by the API, but nothing stops a client sending
      // its own — and it is read back as an object path.
      for (const avatarUrl of ['../../etc/passwd', '/absolute/path', '']) {
        expect(
          updateProfileSchema.safeParse({ ...valid, avatarUrl }).success,
        ).toBe(false)
      }
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
