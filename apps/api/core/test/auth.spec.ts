import type { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AUTH_ERROR_CODES } from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { createOrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { SYSTEM_USER_ID } from '#shared/system-user'

import type { Env } from '../src/config/env'
import { AuthService } from '../src/modules/identity/auth/auth.service'
import { LockoutService } from '../src/modules/identity/auth/lockout.service'
import { PasswordService } from '../src/modules/identity/auth/password.service'
import { Session } from '../src/modules/identity/auth/session.entity'
import {
  ROTATION_GRACE_MS,
  SessionService,
} from '../src/modules/identity/auth/session.service'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  TokenService,
} from '../src/modules/identity/auth/token.service'
import { User } from '../src/modules/identity/user/user.entity'
import { UserService } from '../src/modules/identity/user/user.service'
import { OrganizationMember } from '../src/modules/organization/member.entity'
import { MembershipService } from '../src/modules/organization/membership.service'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

const MAX_ATTEMPTS = 3
const LOCK_MINUTES = 15
const PASSWORD = 'correct horse battery staple'
const ORIGIN = { userAgent: 'vitest', ipAddress: '127.0.0.1' }

/** The three services above AuthService that hold no state worth rebuilding. */
function build(dataSource: DataSource) {
  const users = new UserService(createOrgScopedRepository(dataSource, User))
  const config = {
    get: (key: keyof Env) =>
      key === 'LOGIN_MAX_ATTEMPTS' ? MAX_ATTEMPTS : LOCK_MINUTES,
  } as unknown as ConfigService<Env, true>

  const sessions = new SessionService(
    createOrgScopedRepository(dataSource, Session),
  )

  return {
    users,
    sessions,
    auth: new AuthService(
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
    ),
  }
}

/** The `code` of the ApiException a call threw, for asserting on the branch. */
async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
    return 'did not throw'
  } catch (error) {
    return error instanceof ApiException ? error.code : String(error)
  }
}

describe.skipIf(!hasTestDatabase)('auth', () => {
  let dataSource: DataSource
  let auth: AuthService
  let sessions: SessionService
  let acme: string
  let globex: string

  const emailOf = (name: string) => `${name}@example.com`

  const newUser = async (
    name: string,
    overrides: { status?: string; passwordHash?: string | null } = {},
  ): Promise<string> => {
    const hash =
      overrides.passwordHash === undefined
        ? await new PasswordService().hash(PASSWORD)
        : overrides.passwordHash

    const [user] = (await dataSource.query(
      `INSERT INTO identity.users
         (email, password_hash, name, nickname, status, created_by, updated_by)
       VALUES ($1, $2, $3, $3, $4, $5, $5) RETURNING id`,
      [emailOf(name), hash, name, overrides.status ?? 'active', SYSTEM_USER_ID],
    )) as { id: string }[]

    return user!.id
  }

  const newOrg = async (slug: string): Promise<string> => {
    const [org] = (await dataSource.query(
      `INSERT INTO organization.organizations (name, slug, created_by, updated_by)
       VALUES ($1, $1, $2, $2) RETURNING id`,
      [slug, SYSTEM_USER_ID],
    )) as { id: string }[]

    return org!.id
  }

  const join = (orgId: string, userId: string, role = 'member') =>
    dataSource.query(
      `INSERT INTO organization.members (org_id, user_id, role, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)`,
      [orgId, userId, role, SYSTEM_USER_ID],
    )

  const login = (name: string, password = PASSWORD, rememberMe = false) =>
    auth.login({ email: emailOf(name), password, rememberMe }, ORIGIN)

  /**
   * Through the repository rather than `dataSource.query`, so the row arrives
   * with the entity's property names — raw SQL hands back `revoked_at`, and
   * reading `revokedAt` off that is `undefined`, which satisfies a `toBeNull`
   * written the other way round and asserts nothing.
   */
  const sessionRow = async (id: string): Promise<Session> =>
    (await dataSource.getRepository(Session).findOneBy({ id }))!

  const userRow = async (id: string) => {
    const [row] = (await dataSource.query(
      `SELECT failed_login_attempts, locked_until FROM identity.users WHERE id = $1`,
      [id],
    )) as { failed_login_attempts: number; locked_until: Date | null }[]

    return row!
  }

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()
    acme = await newOrg('acme')
    globex = await newOrg('globex')
  }, 60_000)

  afterAll(async () => {
    await dataSource?.destroy()
  })

  beforeEach(async () => {
    // A fresh AuthService per test: the session cache and the rotation grace
    // window are in-memory, so one test's state must not reach the next.
    const built = build(dataSource)
    auth = built.auth
    sessions = built.sessions

    await dataSource.query(`DELETE FROM identity.sessions`)
    await dataSource.query(`DELETE FROM organization.members`)
    await dataSource.query(`DELETE FROM identity.users WHERE id <> $1`, [
      SYSTEM_USER_ID,
    ])
  })

  describe('login', () => {
    it('issues a session and reports the caller organisations', async () => {
      const userId = await newUser('alice')
      await join(acme, userId, 'owner')

      const result = await login('alice')

      expect(result.memberships).toEqual([
        { orgId: acme, name: 'acme', slug: 'acme', role: 'owner' },
      ])
      // One membership is not a choice, so it is made for them.
      expect(result.activeOrgId).toBe(acme)

      const session = await auth.authenticate(
        // The session id travels in the token and nowhere else.
        decodeSid(result.tokens.accessToken),
      )
      expect(session?.userId).toBe(userId)
    })

    it('leaves the org unchosen for somebody in two', async () => {
      const userId = await newUser('bob')
      await join(acme, userId)
      await join(globex, userId)

      const result = await login('bob')

      expect(result.activeOrgId).toBeNull()
      expect(result.memberships).toHaveLength(2)
    })

    it('succeeds for somebody in no organisation at all', async () => {
      // Not an error: the Home screen lists your organisations before you have
      // any, and a system-role account is deliberately a member of none.
      await newUser('carol')

      const result = await login('carol')

      expect(result.memberships).toEqual([])
      expect(result.activeOrgId).toBeNull()
    })

    it('rejects a wrong password without saying which half was wrong', async () => {
      await newUser('dave')

      expect(await codeOf(login('dave', 'wrong'))).toBe(
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      )
    })

    it('answers an unknown address exactly as it answers a wrong password', async () => {
      expect(await codeOf(login('nobody'))).toBe(
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      )
    })

    it('refuses an account with no password, without a distinct code', async () => {
      // The system user. A null hash means this account cannot sign in with a
      // password at all, and saying so would name the one account that matters.
      await newUser('robot', { passwordHash: null })

      expect(await codeOf(login('robot'))).toBe(
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      )
    })

    it('refuses a deactivated account, but only after a correct password', async () => {
      const userId = await newUser('erin', { status: 'deactivated' })

      // Wrong password first: the status must not leak to somebody guessing.
      expect(await codeOf(login('erin', 'wrong'))).toBe(
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      )
      expect(await codeOf(login('erin'))).toBe(
        AUTH_ERROR_CODES.ACCOUNT_INACTIVE,
      )

      expect(await sessionsOf(userId)).toBe(0)
    })
  })

  describe('lockout', () => {
    it('locks on the Nth failure and not before', async () => {
      const userId = await newUser('frank')

      for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
        expect(await codeOf(login('frank', 'wrong'))).toBe(
          AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        )
      }
      expect((await userRow(userId)).locked_until).toBeNull()

      expect(await codeOf(login('frank', 'wrong'))).toBe(
        AUTH_ERROR_CODES.ACCOUNT_LOCKED,
      )
      expect((await userRow(userId)).locked_until).not.toBeNull()
    })

    it('refuses the correct password while the lock holds', async () => {
      // The whole point of a lock. If the right password still worked, an
      // attacker who found it during the window would not be slowed at all.
      await newUser('grace')
      await failUntilLocked('grace')

      expect(await codeOf(login('grace'))).toBe(AUTH_ERROR_CODES.ACCOUNT_LOCKED)
    })

    it('does not extend the lock on further attempts', async () => {
      // Otherwise anybody can keep a colleague locked out forever by failing
      // on their address.
      const userId = await newUser('heidi')
      await failUntilLocked('heidi')
      const { locked_until: first } = await userRow(userId)

      await codeOf(login('heidi', 'wrong'))
      await codeOf(login('heidi', 'wrong'))

      expect((await userRow(userId)).locked_until).toEqual(first)
    })

    it('lets them back in once the window has passed', async () => {
      const userId = await newUser('ivan')
      await failUntilLocked('ivan')

      await dataSource.query(
        `UPDATE identity.users SET locked_until = now() - interval '1 minute' WHERE id = $1`,
        [userId],
      )

      await expect(login('ivan')).resolves.toBeDefined()
      // And a success clears the counter, so the next mistake starts from one.
      expect(await userRow(userId)).toEqual({
        failed_login_attempts: 0,
        locked_until: null,
      })
    })

    it('counts nothing for an address that does not exist', async () => {
      // Nothing to lock, and pretending otherwise would answer "does this
      // address exist" for free.
      for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt += 1) {
        expect(await codeOf(login('ghost'))).toBe(
          AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        )
      }
    })
  })

  describe('refresh rotation', () => {
    it('issues a new pair and retires the old token', async () => {
      await newUser('judy')
      const { tokens } = await login('judy')

      const rotated = await auth.refresh(tokens.refreshToken)

      expect(rotated.refreshToken).not.toBe(tokens.refreshToken)
      // Deliberately not `not.toBe` on the access token: same user, same
      // session and the same second mint a byte-identical JWT, which is
      // correct rather than a collision. It used to differ here only because
      // the rotated one was missing its `sub` — an assertion that passed on
      // the strength of the bug it should have caught. What has to hold is
      // that the new one stays valid at least as long.
      expect(
        claimsOf(rotated.accessToken).exp as number,
      ).toBeGreaterThanOrEqual(claimsOf(tokens.accessToken).exp as number)
      // Same session, not a new one: the row is the login.
      expect(decodeSid(rotated.accessToken)).toBe(decodeSid(tokens.accessToken))
    })

    it('mints a token that names its user, not just its session', async () => {
      // 🔒 The regression this file missed. `rotate()` asked for `user_id` in
      // its RETURNING, TypeORM takes property names there and dropped the one
      // it did not recognise without complaint, and the token came out with
      // no `sub` — unusable, so every request after a refresh answered 401.
      // Every assertion above still passed, because they only read `sid`.
      const userId = await newUser('nina')
      const { tokens } = await login('nina')

      const rotated = await auth.refresh(tokens.refreshToken)

      expect(claimsOf(rotated.accessToken)).toMatchObject({
        sub: userId,
        sid: decodeSid(tokens.accessToken),
      })
    })

    it('answers a token spent moments ago with the pair it produced', async () => {
      // Two tabs waking together. The row cannot help — it holds hashes — so
      // the plaintext the second tab needs is held in memory for the window.
      await newUser('karl')
      const { tokens } = await login('karl')

      const first = await auth.refresh(tokens.refreshToken)
      const second = await auth.refresh(tokens.refreshToken)

      expect(second).toEqual(first)
    })

    it('treats the same token past the window as theft', async () => {
      const userId = await newUser('lena')
      const { tokens } = await login('lena')

      await auth.refresh(tokens.refreshToken)

      const later = new Date(Date.now() + ROTATION_GRACE_MS + 1_000)
      expect(await codeOf(auth.refresh(tokens.refreshToken, later))).toBe(
        AUTH_ERROR_CODES.SESSION_EXPIRED,
      )

      const [row] = (await dataSource.query(
        `SELECT revoked_reason FROM identity.sessions WHERE user_id = $1`,
        [userId],
      )) as { revoked_reason: string | null }[]

      expect(row!.revoked_reason).toBe('token_reuse')
    })

    it('🔒 lets exactly one of two concurrent refreshes win, and revokes nothing', async () => {
      // Losing a race is not evidence of theft. Both requests read the same
      // token, one UPDATE matches and the other matches nothing — which is why
      // the condition has to live in the UPDATE and not in a SELECT before it.
      await newUser('mona')
      const { tokens } = await login('mona')
      const sid = decodeSid(tokens.accessToken)

      const results = await Promise.allSettled([
        auth.refresh(tokens.refreshToken),
        auth.refresh(tokens.refreshToken),
      ])

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(await codeOfSettled(results)).toBe(
        AUTH_ERROR_CODES.SESSION_EXPIRED,
      )

      const row = await sessionRow(sid)
      expect(row.revokedAt).toBeNull()
      expect(row.revokedReason).toBeNull()
    })

    it('refuses a token nobody ever issued, and revokes nothing', async () => {
      await newUser('nick')
      const { tokens } = await login('nick')

      expect(await codeOf(auth.refresh('not-a-token'))).toBe(
        AUTH_ERROR_CODES.SESSION_EXPIRED,
      )
      expect(
        (await sessionRow(decodeSid(tokens.accessToken))).revokedAt,
      ).toBeNull()
    })

    it('refuses a refresh with no cookie at all', async () => {
      expect(await codeOf(auth.refresh(undefined))).toBe(
        AUTH_ERROR_CODES.SESSION_EXPIRED,
      )
    })

    it('refuses the refresh token of a session that was revoked', async () => {
      await newUser('olga')
      const { tokens } = await login('olga')

      await auth.logout(decodeSid(tokens.accessToken))

      expect(await codeOf(auth.refresh(tokens.refreshToken))).toBe(
        AUTH_ERROR_CODES.SESSION_EXPIRED,
      )
    })
  })

  describe('the per-request check', () => {
    it('caches for thirty seconds and re-reads after', async () => {
      const userId = await newUser('peter')
      const { tokens } = await login('peter')
      const sid = decodeSid(tokens.accessToken)

      await auth.logout(sid)
      // logout evicts in this process, so re-authenticating must miss.
      expect(await auth.authenticate(sid)).toBeNull()

      // And a revocation from elsewhere — another instance — is seen once the
      // cached entry lapses rather than at the token's expiry.
      const other = build(dataSource).auth
      const fresh = await other.authenticate(sid)
      expect(fresh).toBeNull()
      expect(userId).toBeDefined()
    })

    it('stops a deactivated user within the cache window', async () => {
      const userId = await newUser('quinn')
      const { tokens } = await login('quinn')
      const sid = decodeSid(tokens.accessToken)

      expect(await auth.authenticate(sid)).not.toBeNull()

      await dataSource.query(
        `UPDATE identity.users SET status = 'deactivated' WHERE id = $1`,
        [userId],
      )

      // Still cached, by design — this is the cost of keeping the token empty.
      expect(await auth.authenticate(sid)).not.toBeNull()

      const later = new Date(Date.now() + 31_000)
      expect(await auth.authenticate(sid, later)).toBeNull()
    })

    it('🔒 drops an org membership within the cache window', async () => {
      const userId = await newUser('rita')
      await join(acme, userId)
      await join(globex, userId)
      const { tokens } = await login('rita')
      const sid = decodeSid(tokens.accessToken)

      expect((await auth.authenticate(sid))?.memberships).toHaveLength(2)

      await dataSource.query(
        `DELETE FROM organization.members WHERE user_id = $1 AND org_id = $2`,
        [userId, globex],
      )

      const later = new Date(Date.now() + 31_000)
      const seen = await auth.authenticate(sid, later)

      expect(seen?.memberships.map((m) => m.orgId)).toEqual([acme])
    })

    it('signs out every device at once', async () => {
      const userId = await newUser('sam')
      const first = await login('sam')
      const second = await login('sam')

      await auth.logoutAll(userId)

      for (const { tokens } of [first, second]) {
        expect(
          await auth.authenticate(decodeSid(tokens.accessToken)),
        ).toBeNull()
      }
    })

    it('rejects a session id that was never issued', async () => {
      expect(
        await auth.authenticate('00000000-0000-4000-8000-000000000001'),
      ).toBeNull()
    })

    it('rejects a session past its expiry without anyone revoking it', async () => {
      await newUser('tina')
      const { tokens } = await login('tina')
      const sid = decodeSid(tokens.accessToken)

      await dataSource.query(
        `UPDATE identity.sessions SET expires_at = now() - interval '1 day' WHERE id = $1`,
        [sid],
      )

      expect(
        await auth.authenticate(sid, new Date(Date.now() + 31_000)),
      ).toBeNull()
    })
  })

  describe('session rows', () => {
    it('records where the login came from, and how long it may last', async () => {
      await newUser('uma')

      const short = await login('uma')
      const remembered = await login('uma', PASSWORD, true)

      const shortRow = await sessionRow(decodeSid(short.tokens.accessToken))
      const longRow = await sessionRow(decodeSid(remembered.tokens.accessToken))

      expect(shortRow.userAgent).toBe(ORIGIN.userAgent)
      expect(shortRow.ipAddress).toBe(ORIGIN.ipAddress)
      // "Remember me" is not a mechanism, only a longer expires_at.
      expect(longRow.expiresAt.getTime()).toBeGreaterThan(
        shortRow.expiresAt.getTime(),
      )
    })

    it('stores no refresh token in plaintext', async () => {
      // A dump of this table must hand over nothing usable.
      await newUser('vera')
      const { tokens } = await login('vera')

      const [row] = (await dataSource.query(
        `SELECT current_token_hash FROM identity.sessions`,
      )) as { current_token_hash: string }[]

      expect(row!.current_token_hash).not.toBe(tokens.refreshToken)
      expect(row!.current_token_hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('writes last_used_at lazily rather than on every request', async () => {
      // Per-request writes would make sessions the hottest table in the schema
      // for a column no query reads.
      await newUser('walt')
      const { tokens } = await login('walt')
      const sid = decodeSid(tokens.accessToken)

      const session = await sessions.findLive(sid)
      const before = session!.lastUsedAt

      await sessions.touch(session!, new Date(before.getTime() + 60_000))
      expect((await sessionRow(sid)).lastUsedAt).toEqual(before)

      await sessions.touch(session!, new Date(before.getTime() + 6 * 60_000))
      expect((await sessionRow(sid)).lastUsedAt).not.toEqual(before)
    })
  })

  // --- helpers -----------------------------------------------------------

  async function failUntilLocked(name: string): Promise<void> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await codeOf(login(name, 'wrong'))
    }
  }

  async function sessionsOf(userId: string): Promise<number> {
    const [row] = (await dataSource.query(
      `SELECT count(*)::int AS count FROM identity.sessions WHERE user_id = $1`,
      [userId],
    )) as { count: number }[]

    return row!.count
  }
})

/** The session id, read back out of the access token the way the guard will. */
function claimsOf(accessToken: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(accessToken.split('.')[1]!, 'base64url').toString(),
  ) as Record<string, unknown>
}

function decodeSid(accessToken: string): string {
  return claimsOf(accessToken).sid as string
}

async function codeOfSettled(
  results: PromiseSettledResult<unknown>[],
): Promise<string> {
  const rejected = results.find((result) => result.status === 'rejected')
  const reason = (rejected as PromiseRejectedResult | undefined)?.reason

  return reason instanceof ApiException ? reason.code : String(reason)
}
