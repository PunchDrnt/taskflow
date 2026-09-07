import {
  forwardRef,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import {
  AUTH_ERROR_CODES,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
} from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { alertsFor } from '#shared/jobs/alert'

import { AuditService } from '../../audit/audit.service'
import {
  MembershipService,
  resolveActiveOrg,
  type Membership,
} from '../../organization/membership.service'
import { ACTIVE_USER_STATUS, UserService } from '../user/user.service'
import { LockoutService } from './lockout.service'
import { PasswordService } from './password.service'
import {
  ROTATION_GRACE_MS,
  SessionService,
  type SessionOrigin,
  type SessionRecord,
} from './session.service'
import { TokenService, type Tokens } from './token.service'
import { TwoFactorService } from './two-factor.service'

const alerts = alertsFor('auth')

/**
 * How long an authenticated request may reuse the last session lookup.
 *
 * The whole cost of keeping role and org out of the token: revoking either
 * takes effect within this window instead of within the token's fifteen
 * minutes. Thirty seconds is the number docs/01-architecture.md#auth fixes.
 */
const SESSION_CACHE_TTL_MS = 30_000

/** Past this many entries the expired ones are swept. ~20 daily users. */
const SESSION_CACHE_SWEEP_AT = 500

/** Who is calling, resolved from a session id — what the guard needs. */
export interface AuthenticatedUser {
  userId: string
  sessionId: string
  memberships: Membership[]
}

export interface LoginResult {
  tokens: Tokens
  memberships: Membership[]
  /** Set when exactly one membership makes the choice for them. */
  activeOrgId: string | null
}

/**
 * The password was right and a second factor is owed.
 *
 * A separate shape rather than a nullable `tokens`, so a caller cannot reach
 * for the session that a half-finished login does not have.
 */
export interface TwoFactorChallenge {
  challenge: string
}

export type LoginOutcome = LoginResult | TwoFactorChallenge

/** Narrows the union at the one place the controller has to branch. */
export function isTwoFactorChallenge(
  outcome: LoginOutcome,
): outcome is TwoFactorChallenge {
  return 'challenge' in outcome
}

interface CacheEntry {
  value: AuthenticatedUser
  expiresAt: number
}

/**
 * The auth flows: sign in, sign out, refresh, and the per-request check the
 * guard runs. Owns the policy; SessionService, LockoutService, PasswordService
 * and TokenService own the mechanisms.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  /** sid → who, for SESSION_CACHE_TTL_MS. Per instance, and that is fine. */
  private readonly cache = new Map<string, CacheEntry>()

  /**
   * A refresh that has just happened, keyed by the hash of the token it spent.
   * See `refresh` — this is what makes the grace window able to *answer*.
   */
  private readonly recentRotations = new Map<
    string,
    { tokens: Tokens; expiresAt: number }
  >()

  /**
   * An argon2 hash of nothing anybody knows, verified against when the email
   * does not exist so that the two answers take the same time. Without it a
   * fast rejection is an oracle for which addresses are registered — the one
   * thing the shared INVALID_CREDENTIALS message exists to hide.
   */
  private decoyHash: Promise<string> | null = null

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly users: UserService,
    private readonly memberships: MembershipService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly lockout: LockoutService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    @Inject(forwardRef(() => TwoFactorService))
    private readonly twoFactor: TwoFactorService,
  ) {}

  // --- login -------------------------------------------------------------

  async login(input: LoginInput, origin: SessionOrigin): Promise<LoginOutcome> {
    // Either identifier — the caller typed one field and never said which.
    const user = await this.users.findByLogin(input.login)

    if (!user || user.passwordHash === null) {
      await this.passwords.verify(await this.decoy(), input.password)
      throw invalidCredentials()
    }

    // Before the password, so an attempt during a lock never reaches the
    // counter and so cannot extend it.
    if (this.lockout.isLocked(user)) throw accountLocked()

    if (!(await this.passwords.verify(user.passwordHash, input.password))) {
      const locked = await this.lockout.recordFailure(user)

      await this.recordFailedLogin(user.id, locked)

      throw locked ? accountLocked() : invalidCredentials()
    }

    // Only after a correct password, so a deactivated account is revealed to
    // the person who owns it and to nobody else.
    if (user.status !== ACTIVE_USER_STATUS) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        AUTH_ERROR_CODES.ACCOUNT_INACTIVE,
        'บัญชีนี้ถูกปิดใช้งาน',
      )
    }

    await this.lockout.reset(user)

    // The password is spent at this point — the counter is cleared and the
    // account is known good — so a second factor is a *step*, not a failure.
    // No session is created here: an account with 2FA on must not be reachable
    // by a caller who only ever proved one thing.
    if (await this.twoFactor.isEnabled(user.id)) {
      return { challenge: this.tokens.signTwoFactorChallenge(user.id) }
    }

    return this.issueSession(user.id, origin, input.rememberMe)
  }

  /**
   * Writes a failed sign-in to the activity log, once per organisation the
   * account belongs to.
   *
   * **Per organisation, because that is who needs to read it.** A failed login
   * has no active org — the endpoint is `@Public()` and runs before any
   * context exists — but `audit.logs.org_id` is NOT NULL by the 🔒 rule that
   * every org-owned row carries it, and the person who acts on "somebody is
   * trying to get into Kit's account" is the admin of the company Kit works
   * for. So the row lands in each of their organisations rather than nowhere.
   * An account in no organisation produces no row; there is no one to tell.
   *
   * ⚠️ **Only the attempts the lockout counts.** An attempt made *during* a
   * lock returns earlier and is deliberately not logged: those are unbounded
   * — an attacker can make them as fast as the network allows — and
   * `audit.logs` is partitioned, never deleted, and written in the same
   * transaction as real work. Counted failures are capped at
   * `LOGIN_MAX_ATTEMPTS` per window per account, which is a bound worth
   * having in a table nothing ever removes rows from.
   *
   * The account is both the subject and the actor. Nothing here knows who was
   * really typing, and claiming otherwise in a log that cannot be edited
   * afterwards would be worse than saying only what is known.
   */
  private async recordFailedLogin(
    userId: string,
    locked: boolean,
  ): Promise<void> {
    const memberships = await this.memberships.listForUser(userId)

    if (memberships.length === 0) return

    await this.dataSource.transaction(async (manager) => {
      for (const membership of memberships) {
        await this.audit.recordFor(
          manager,
          { orgId: membership.orgId, actorId: userId },
          {
            entityType: 'user',
            entityId: userId,
            action: locked ? 'login_locked' : 'login_failed',
          },
        )
      }
    })
  }

  /**
   * Everything after the last check, shared by the one-step login and the
   * second half of the two-step one — so the two cannot drift into issuing
   * subtly different sessions.
   */
  async issueSession(
    userId: string,
    origin: SessionOrigin,
    rememberMe: boolean,
  ): Promise<LoginResult> {
    const refreshToken = this.tokens.createRefreshToken()
    const session = await this.sessions.create(
      userId,
      this.tokens.hashRefreshToken(refreshToken),
      origin,
      rememberMe,
    )

    const memberships = await this.memberships.listForUser(userId)

    return {
      tokens: {
        accessToken: this.tokens.signAccessToken({
          sub: userId,
          sid: session.id,
        }),
        refreshToken,
      },
      memberships,
      // No cookie exists yet, so this is only ever the single-membership case.
      activeOrgId: resolveActiveOrg(memberships, undefined).orgId,
    }
  }

  /**
   * Creates an account that belongs to no organisation.
   *
   * Deliberately does not sign the new person in. There is nothing for them to
   * see yet — they are a member of nowhere until an admin adds them — and
   * issuing a session here would be one more path that mints one.
   *
   * A duplicate address is reported as taken rather than swallowed. That does
   * leak whether an address is registered, which `forgot-password` works hard
   * to avoid; the difference is that a sign-up form has no other way to
   * explain itself, and the whole endpoint is behind a flag that is off. If
   * public registration is ever switched on, this is the line to revisit —
   * the usual answer is to accept quietly and send a "you already have an
   * account" mail instead.
   */
  async register(input: RegisterInput): Promise<{ id: string }> {
    if (await this.users.findByEmail(input.email)) throw emailTaken()
    if (await this.users.findByUsername(input.username)) throw usernameTaken()

    const user = await this.users.create({
      email: input.email,
      username: input.username,
      passwordHash: await this.passwords.hash(input.password),
      name: input.name,
      nickname: input.nickname,
    })

    return { id: user.id }
  }

  // --- refresh -----------------------------------------------------------

  /**
   * Spends a refresh token for a new pair.
   *
   * Four outcomes, and the difference between the middle two is the whole
   * design:
   *
   * | presented token | answer |
   * | --- | --- |
   * | the current one | rotated, new pair |
   * | one rotated away seconds ago, by this instance | the pair that rotation produced |
   * | one rotated away seconds ago, race lost | 401, session left alone |
   * | one rotated away longer ago | 401, session revoked as `token_reuse` |
   *
   * Losing a race is not evidence of theft. Two tabs waking together both
   * present the same token, one `UPDATE` wins, and revoking on the other would
   * sign people out for having two tabs open. What separates the two is time,
   * not order: past the grace window nobody is still racing, and a token that
   * was replaced is a token that should have been forgotten.
   *
   * `recentRotations` is what lets the grace window *answer* rather than
   * merely forgive. The row cannot help — it holds hashes, and the plaintext
   * the loser needs exists only in the reply the winner got, so it is held
   * here for those ten seconds and nowhere else.
   */
  async refresh(
    presented: string | undefined,
    now = new Date(),
  ): Promise<Tokens> {
    if (presented === undefined) throw sessionExpired()

    const presentedHash = this.tokens.hashRefreshToken(presented)

    const replayed = this.recentRotations.get(presentedHash)
    if (replayed && replayed.expiresAt > now.getTime()) return replayed.tokens

    const nextToken = this.tokens.createRefreshToken()
    const rotated = await this.sessions.rotate(
      presentedHash,
      this.tokens.hashRefreshToken(nextToken),
      now,
    )

    if (rotated) {
      this.cache.delete(rotated.id)

      const tokens = {
        accessToken: this.tokens.signAccessToken({
          sub: rotated.userId,
          sid: rotated.id,
        }),
        refreshToken: nextToken,
      }

      this.sweep(this.recentRotations, now.getTime())
      this.recentRotations.set(presentedHash, {
        tokens,
        expiresAt: now.getTime() + ROTATION_GRACE_MS,
      })

      return tokens
    }

    await this.detectReuse(presentedHash, now)

    throw sessionExpired()
  }

  /**
   * The token was not current. If it is one this session rotated away from
   * outside the grace window, somebody is using a token that was replaced —
   * either the thief or the victim, and there is no way to tell which, so the
   * session ends for both.
   */
  private async detectReuse(presentedHash: string, now: Date): Promise<void> {
    const session = await this.sessions.findByPreviousToken(presentedHash)
    if (!session) return

    const rotatedAt = session.rotatedAt?.getTime() ?? 0
    if (now.getTime() - rotatedAt <= ROTATION_GRACE_MS) return

    await this.sessions.revoke(session.id, 'token_reuse', now)
    this.cache.delete(session.id)

    this.logger.warn(
      `Refresh token reuse on session ${session.id}; session revoked`,
    )
    alerts.condition('Refresh token reuse detected', {
      sessionId: session.id,
      userId: session.userId,
      rotatedAt: session.rotatedAt,
    })
  }

  // --- logout ------------------------------------------------------------

  /**
   * Which session a refresh token belongs to, for logout. The refresh cookie
   * is what logout has to work from: it names one session, where an access
   * token would have to be trusted for the `sid` inside it — and logging out
   * has to keep working after that token has expired.
   */
  findSessionByRefreshToken(token: string): Promise<SessionRecord | null> {
    return this.sessions
      .findByCurrentToken(this.tokens.hashRefreshToken(token))
      .then((session) =>
        session ? { id: session.id, userId: session.userId } : null,
      )
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId, 'logout')
    this.cache.delete(sessionId)
  }

  /** Every device, this one included — for "sign out everywhere". */
  async logoutAll(userId: string): Promise<void> {
    await this.sessions.revokeAllForUser(userId, 'logout_all')
    this.cache.clear()
  }

  // --- passwords ---------------------------------------------------------

  /**
   * Changes a password for somebody already signed in, and signs every *other*
   * device out.
   *
   * That asymmetry is the point. The reason to change a password is usually
   * that somebody else might know it, so every session it could have opened
   * has to go — but ending the caller's own session too would answer a
   * successful change with a login screen, which reads as a failure and
   * teaches people not to do it.
   *
   * `currentPassword` is verified every time, including here where the caller
   * already holds a valid session: an unlocked laptop is exactly the case this
   * check exists for.
   */
  async changePassword(
    userId: string,
    sessionId: string,
    input: ChangePasswordInput,
    now = new Date(),
  ): Promise<{ signedOutSessions: number }> {
    const user = await this.users.findById(userId)

    // No password set at all — the system user, or an account that only ever
    // signed in through a provider. There is nothing to verify against, and
    // treating an absent hash as a match would be a way in.
    if (!user?.passwordHash) throw wrongCurrentPassword()

    if (
      !(await this.passwords.verify(user.passwordHash, input.currentPassword))
    )
      throw wrongCurrentPassword()

    await this.users.setPasswordHash(
      userId,
      await this.passwords.hash(input.newPassword),
      userId,
      now,
    )

    const signedOutSessions = await this.sessions.revokeAllForUser(
      userId,
      'password_changed',
      sessionId,
      now,
    )

    this.forgetSessions(userId, sessionId)

    return { signedOutSessions }
  }

  /**
   * Drops one person's cached sessions, keeping `except` if given.
   *
   * Revoking writes the row, but a cache hit within SESSION_CACHE_TTL_MS never
   * reads it — so without this a sign-out is eventual rather than immediate.
   * Thirty seconds of that is the accepted cost for an ordinary revocation; it
   * is not the right answer when the reason is "somebody else may be signed in
   * as me", which is what both password paths are for. Public so
   * `PasswordResetService` can say the same thing.
   *
   * Per instance, like the cache itself. With more than one API process this
   * becomes shared state, which is one of the three things
   * docs/01-architecture.md names as the reason to add Redis.
   */
  forgetSessions(userId: string, except?: string): void {
    for (const [sid, entry] of this.cache) {
      if (entry.value.userId === userId && sid !== except)
        this.cache.delete(sid)
    }
  }

  // --- the per-request check ---------------------------------------------

  /**
   * Who a session id belongs to, and which orgs they may act for — one lookup,
   * cached for thirty seconds.
   *
   * Memberships are loaded in the same fill rather than in a second query,
   * because the guard needs both on every request and neither is in the token.
   * That is what makes removing someone from an org take effect in thirty
   * seconds instead of at the next token expiry.
   */
  async authenticate(
    sessionId: string,
    now = new Date(),
  ): Promise<AuthenticatedUser | null> {
    const cached = this.cache.get(sessionId)
    if (cached && cached.expiresAt > now.getTime()) return cached.value

    const session = await this.sessions.findLive(sessionId, now)
    if (!session) return null

    const user = await this.users.findById(session.userId)
    if (!user || user.status !== ACTIVE_USER_STATUS) return null

    const value: AuthenticatedUser = {
      userId: user.id,
      sessionId: session.id,
      memberships: await this.memberships.listForUser(user.id),
    }

    this.sweep(this.cache, now.getTime())
    this.cache.set(sessionId, {
      value,
      expiresAt: now.getTime() + SESSION_CACHE_TTL_MS,
    })

    // Outside the cached path on purpose: it is already rate-limited to one
    // write per five minutes, and skipping it on a cache hit would stretch
    // that to whatever the traffic happens to be.
    await this.sessions.touch(session, now)

    return value
  }

  // --- internals ---------------------------------------------------------

  private decoy(): Promise<string> {
    this.decoyHash ??= this.passwords.hash(this.tokens.createRefreshToken())

    return this.decoyHash
  }

  /** Neither map is ever read after expiry, so nothing evicts them otherwise. */
  private sweep(map: Map<string, { expiresAt: number }>, now: number): void {
    if (map.size < SESSION_CACHE_SWEEP_AT) return

    for (const [key, entry] of map) {
      if (entry.expiresAt <= now) map.delete(key)
    }
  }
}

function invalidCredentials(): ApiException {
  return new ApiException(
    HttpStatus.UNAUTHORIZED,
    AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  )
}

/** Says locked, never for how long — see LockoutService. */
function accountLocked(): ApiException {
  return new ApiException(
    HttpStatus.UNAUTHORIZED,
    AUTH_ERROR_CODES.ACCOUNT_LOCKED,
    'บัญชีถูกล็อกชั่วคราวจากการเข้าสู่ระบบผิดหลายครั้ง',
  )
}

function sessionExpired(): ApiException {
  return new ApiException(
    HttpStatus.UNAUTHORIZED,
    AUTH_ERROR_CODES.SESSION_EXPIRED,
    'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  )
}

/**
 * 400, not 401: the caller is signed in and stays signed in — what failed is
 * one field of a form, and a 401 would send the client to the login screen it
 * does not need.
 */
function wrongCurrentPassword(): ApiException {
  return new ApiException(
    HttpStatus.BAD_REQUEST,
    AUTH_ERROR_CODES.WRONG_CURRENT_PASSWORD,
    'รหัสผ่านปัจจุบันไม่ถูกต้อง',
  )
}

/** 409, because the request is well-formed and conflicts with what exists. */
function emailTaken(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    AUTH_ERROR_CODES.EMAIL_TAKEN,
    'อีเมลนี้ถูกใช้แล้ว',
  )
}

/** Same shape as `emailTaken`, and the same caveat about what it reveals. */
function usernameTaken(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    AUTH_ERROR_CODES.USERNAME_TAKEN,
    'ชื่อผู้ใช้นี้ถูกใช้แล้ว',
  )
}
