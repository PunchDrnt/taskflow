import type { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { generateSync } from 'otplib'
import { IsNull, type DataSource } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ApiException } from '#shared/http/api-exception'
import { createOrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { SYSTEM_USER_ID } from '#shared/system-user'

import type { Env } from '../src/config/env'
import { AuditService } from '../src/modules/audit/audit.service'
import { AuditLog } from '../src/modules/audit/log.entity'
import {
  AuthService,
  isTwoFactorChallenge,
} from '../src/modules/iam/auth/auth.service'
import { LockoutService } from '../src/modules/iam/auth/lockout.service'
import { PasswordService } from '../src/modules/iam/auth/password.service'
import { RecoveryCode } from '../src/modules/iam/auth/recovery-code.entity'
import { Session } from '../src/modules/iam/auth/session.entity'
import { SessionService } from '../src/modules/iam/auth/session.service'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  TokenService,
} from '../src/modules/iam/auth/token.service'
import { TotpCredential } from '../src/modules/iam/auth/totp-credential.entity'
import {
  TOTP_STEP_SECONDS,
  TotpService,
} from '../src/modules/iam/auth/totp.service'
import { TwoFactorService } from '../src/modules/iam/auth/two-factor.service'
import { User } from '../src/modules/iam/user/user.entity'
import { UserService } from '../src/modules/iam/user/user.service'
import { OrganizationMember } from '../src/modules/organization/member.entity'
import { MembershipService } from '../src/modules/organization/membership.service'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

const PASSWORD = 'correct horse battery staple'
const MAX_ATTEMPTS = 3
const ORIGIN = { userAgent: 'vitest', ipAddress: '127.0.0.1' }

/** What an authenticator app would show at this instant. */
const codeAt = (secret: string, now: Date): string =>
  generateSync({
    secret,
    period: TOTP_STEP_SECONDS,
    epoch: Math.floor(now.getTime() / 1000),
  })

describe.skipIf(!hasTestDatabase)('two-factor', () => {
  let dataSource: DataSource
  let users: UserService
  let sessions: SessionService
  let totp: TotpService
  let twoFactor: TwoFactorService
  let auth: AuthService
  let counter = 0

  const config = {
    get: (key: keyof Env) => {
      if (key === 'LOGIN_MAX_ATTEMPTS') return MAX_ATTEMPTS
      if (key === 'LOGIN_LOCK_MINUTES') return 15
      return Buffer.alloc(32, 9).toString('base64')
    },
  } as unknown as ConfigService<Env, true>

  const newUser = async (): Promise<string> => {
    counter += 1
    const hash = await new PasswordService().hash(PASSWORD)
    const [user] = (await dataSource.query(
      `INSERT INTO iam.users
         (email, username, password_hash, name, nickname, status, created_by,
          updated_by)
       VALUES ($1, $2, $3, $4, $4, 'active', $5, $5) RETURNING id`,
      [
        `tfa-${counter}@example.test`,
        `tfa_${counter}`,
        hash,
        `user-${counter}`,
        SYSTEM_USER_ID,
      ],
    )) as { id: string }[]

    return user!.id
  }

  /** Enrolled and switched on, with the plaintext secret kept for the test. */
  const enrolled = async (
    userId: string,
  ): Promise<{ secret: string; recoveryCodes: string[] }> => {
    const setup = await twoFactor.startSetup(userId, PASSWORD)
    const { recoveryCodes } = await twoFactor.enable(
      userId,
      codeAt(setup.secret, new Date()),
    )

    return { secret: setup.secret, recoveryCodes }
  }

  const codeOf = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise
      return 'did not throw'
    } catch (error) {
      return error instanceof ApiException ? error.code : String(error)
    }
  }

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()
    users = new UserService(createOrgScopedRepository(dataSource, User))
    sessions = new SessionService(
      createOrgScopedRepository(dataSource, Session),
    )
    totp = new TotpService(config)
    twoFactor = new TwoFactorService(
      createOrgScopedRepository(dataSource, TotpCredential),
      createOrgScopedRepository(dataSource, RecoveryCode),
      dataSource,
      users,
      new PasswordService(),
      sessions,
      totp,
      config,
    )
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
  })

  afterAll(async () => {
    await dataSource?.destroy()
  })

  describe('enrolling', () => {
    it('is off until a code confirms the secret arrived', async () => {
      // An abandoned setup must never stand between somebody and their
      // account — opening the screen and closing the tab is the common case.
      const id = await newUser()

      await twoFactor.startSetup(id, PASSWORD)

      expect(await twoFactor.isEnabled(id)).toBe(false)
    })

    it('refuses to start without the password', async () => {
      // The attack this closes: somebody holding a stolen session enrols their
      // own authenticator and locks the owner out of their own account.
      const id = await newUser()

      expect(await codeOf(twoFactor.startSetup(id, 'not the password'))).toBe(
        'WRONG_CURRENT_PASSWORD',
      )
    })

    it('replaces an abandoned secret rather than keeping both', async () => {
      const id = await newUser()
      const first = await twoFactor.startSetup(id, PASSWORD)
      const second = await twoFactor.startSetup(id, PASSWORD)

      expect(second.secret).not.toBe(first.secret)
      expect(
        await codeOf(twoFactor.enable(id, codeAt(first.secret, new Date()))),
      ).toBe('INVALID_TWO_FACTOR_CODE')
      await expect(
        twoFactor.enable(id, codeAt(second.secret, new Date())),
      ).resolves.toBeDefined()
    })

    it('hands back ten recovery codes and stores only their hashes', async () => {
      const id = await newUser()
      const { recoveryCodes } = await enrolled(id)

      expect(recoveryCodes).toHaveLength(10)
      expect(new Set(recoveryCodes).size).toBe(10)

      const stored = await dataSource
        .getRepository(RecoveryCode)
        .findBy({ userId: id })
      expect(stored).toHaveLength(10)
      for (const row of stored) {
        expect(recoveryCodes).not.toContain(row.codeHash)
        expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/)
      }
    })

    it('never stores the secret in the clear', async () => {
      // 🔒 A TOTP secret is shared, so it cannot be hashed the way a password
      // is; the only thing between a stolen dump and every second factor is
      // that the key is not in the dump.
      const id = await newUser()
      const { secret } = await enrolled(id)

      const row = await dataSource
        .getRepository(TotpCredential)
        .findOneBy({ userId: id })

      expect(row!.secretEncrypted).not.toContain(secret)
      expect(totp.decrypt(row!.secretEncrypted)).toBe(secret)
    })

    it('refuses a second enrolment while one is live', async () => {
      const id = await newUser()
      await enrolled(id)

      expect(await codeOf(twoFactor.startSetup(id, PASSWORD))).toBe(
        'TWO_FACTOR_ALREADY_ENABLED',
      )
    })
  })

  describe('verifying', () => {
    it('accepts the code the app is showing', async () => {
      const id = await newUser()
      const { secret } = await enrolled(id)
      const later = new Date(Date.now() + 60_000)

      await expect(
        twoFactor.verify(id, codeAt(secret, later), later),
      ).resolves.toBeUndefined()
    })

    it('🔒 refuses the same code twice inside its window', async () => {
      // A code stays valid for its whole 30 seconds, so without remembering
      // the step it matched, one code seen over a shoulder works twice.
      const id = await newUser()
      const { secret } = await enrolled(id)
      const at = new Date(Date.now() + 60_000)
      const code = codeAt(secret, at)

      await twoFactor.verify(id, code, at)

      expect(await codeOf(twoFactor.verify(id, code, at))).toBe(
        'INVALID_TWO_FACTOR_CODE',
      )
    })

    it('refuses a code from a step already passed', async () => {
      const id = await newUser()
      const { secret } = await enrolled(id)
      const now = new Date(Date.now() + 120_000)
      const earlier = new Date(now.getTime() - TOTP_STEP_SECONDS * 1000)

      await twoFactor.verify(id, codeAt(secret, now), now)

      expect(
        await codeOf(twoFactor.verify(id, codeAt(secret, earlier), now)),
      ).toBe('INVALID_TWO_FACTOR_CODE')
    })

    it('accepts a recovery code once, and only once', async () => {
      const id = await newUser()
      const { recoveryCodes } = await enrolled(id)
      const code = recoveryCodes[0]!

      await expect(twoFactor.verify(id, code)).resolves.toBeUndefined()
      expect(await codeOf(twoFactor.verify(id, code))).toBe(
        'INVALID_TWO_FACTOR_CODE',
      )
      expect(await twoFactor.remainingRecoveryCodes(id)).toBe(9)
    })

    it('locks after too many wrong codes, and not before', async () => {
      // Six digits is a million guesses and a challenge can be reissued by
      // signing in again, so the window is not self-limiting.
      const id = await newUser()
      await enrolled(id)

      for (let n = 1; n < MAX_ATTEMPTS; n += 1) {
        expect(await codeOf(twoFactor.verify(id, '000000'))).toBe(
          'INVALID_TWO_FACTOR_CODE',
        )
      }

      // The attempt that trips it says so, like the password lockout does.
      expect(await codeOf(twoFactor.verify(id, '000000'))).toBe(
        'ACCOUNT_LOCKED',
      )
      // And it stays said, rather than resetting to a generic refusal.
      expect(await codeOf(twoFactor.verify(id, '111111'))).toBe(
        'ACCOUNT_LOCKED',
      )
    })

    it('clears the failure count on a good code', async () => {
      const id = await newUser()
      const { secret } = await enrolled(id)
      const at = new Date(Date.now() + 90_000)

      await codeOf(twoFactor.verify(id, '000000', at))
      await twoFactor.verify(id, codeAt(secret, at), at)

      const row = await dataSource
        .getRepository(TotpCredential)
        .findOneBy({ userId: id })
      expect(row!.failedAttempts).toBe(0)
      expect(row!.lockedUntil).toBeNull()
    })
  })

  describe('signing in', () => {
    it('stops at a challenge instead of issuing a session', async () => {
      // 🔒 The whole point: an account with 2FA on must not be reachable by a
      // caller who has only proved one thing.
      const id = await newUser()
      await enrolled(id)
      const before = await dataSource
        .getRepository(Session)
        .countBy({ userId: id, revokedAt: IsNull() })

      const outcome = await auth.login(
        { login: `tfa_${counter}`, password: PASSWORD },
        ORIGIN,
      )

      expect(isTwoFactorChallenge(outcome)).toBe(true)
      expect(
        await dataSource
          .getRepository(Session)
          .countBy({ userId: id, revokedAt: IsNull() }),
      ).toBe(before)
    })

    it('issues one once the second factor is proved', async () => {
      const id = await newUser()
      const { secret } = await enrolled(id)

      const outcome = await auth.login(
        { login: `tfa_${counter}`, password: PASSWORD },
        ORIGIN,
      )
      expect(isTwoFactorChallenge(outcome)).toBe(true)

      // A step later than the one `enable` consumed: confirming the enrolment
      // spends that code, so reusing it here would be the replay the service
      // is built to refuse.
      const later = new Date(Date.now() + 60_000)
      await twoFactor.verify(id, codeAt(secret, later), later)
      const result = await auth.issueSession(id, ORIGIN)

      expect(result.tokens.accessToken).toBeTruthy()
      expect(
        await dataSource
          .getRepository(Session)
          .countBy({ userId: id, revokedAt: IsNull() }),
      ).toBe(1)
    })

    it('still refuses a wrong password before any of this', async () => {
      const id = await newUser()
      await enrolled(id)

      expect(
        await codeOf(
          auth.login({ login: `tfa_${counter}`, password: 'wrong' }, ORIGIN),
        ),
      ).toBe('INVALID_CREDENTIALS')
    })

    it('goes back to one step once it is switched off', async () => {
      const id = await newUser()
      await enrolled(id)
      const session = await sessions.create(
        id,
        'hash-for-the-current-session',
        ORIGIN,
      )

      await twoFactor.disable(id, session.id, PASSWORD)

      const outcome = await auth.login(
        { login: `tfa_${counter}`, password: PASSWORD },
        ORIGIN,
      )
      expect(isTwoFactorChallenge(outcome)).toBe(false)
      expect(await twoFactor.remainingRecoveryCodes(id)).toBe(0)
    })

    it('needs the password to switch off, and keeps the caller signed in', async () => {
      const id = await newUser()
      await enrolled(id)
      const mine = await sessions.create(id, 'mine', ORIGIN)
      await sessions.create(id, 'elsewhere', ORIGIN)

      expect(
        await codeOf(twoFactor.disable(id, mine.id, 'not the password')),
      ).toBe('WRONG_CURRENT_PASSWORD')
      expect(await twoFactor.isEnabled(id)).toBe(true)

      const result = await twoFactor.disable(id, mine.id, PASSWORD)

      expect(result.signedOutSessions).toBe(1)
      expect(await sessions.findLive(mine.id)).not.toBeNull()
    })
  })
})
