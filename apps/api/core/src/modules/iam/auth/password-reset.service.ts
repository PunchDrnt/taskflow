import { randomBytes } from 'node:crypto'
import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, IsNull } from 'typeorm'

import { AUTH_ERROR_CODES } from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { SYSTEM_USER_ID } from '#shared/system-user'

import type { Env } from '../../../config/env'
import { EmailService } from '../../notify/email.service'
import { ACTIVE_USER_STATUS, UserService } from '../user/user.service'
import { AuthService } from './auth.service'
import { PasswordResetToken } from './password-reset-token.entity'
import { PasswordService } from './password.service'
import { SessionService } from './session.service'
import { TokenService } from './token.service'

/** The template `renderTemplate` turns into the mail that carries the link. */
export const PASSWORD_RESET_TEMPLATE = 'password_reset'

/**
 * Forgotten passwords: issue a single-use link, and spend it.
 *
 * Every branch of `request` answers the same way — nothing here tells the
 * caller whether an address exists, which is the one property the endpoint has
 * to have. `reset` is allowed to be specific, because by then the caller is
 * holding a token only the address's owner could have received.
 *
 * Separate from AuthService, which is already the largest class here and is
 * about getting in with credentials you have rather than replacing ones you
 * lost.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name)
  private readonly ttlMinutes: number
  private readonly maxPerHour: number
  private readonly appUrl: string

  constructor(
    @InjectOrgRepository(PasswordResetToken)
    private readonly resets: OrgScopedRepository<PasswordResetToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly users: UserService,
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly email: EmailService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMinutes = config.get('PASSWORD_RESET_TTL_MINUTES', { infer: true })
    this.maxPerHour = config.get('PASSWORD_RESET_MAX_PER_HOUR', { infer: true })
    this.appUrl = config.get('APP_URL', { infer: true })
  }

  /**
   * Sends a link, or quietly does nothing. The caller cannot tell which, and
   * that is the point: an endpoint that answered differently for a known
   * address would be a way to enumerate every account in the system.
   *
   * Four reasons to do nothing, all silent — no such address, the account is
   * not active, it has no password to reset (a provider-only login), or this
   * address has already asked too many times this hour.
   */
  async request(email: string, now = new Date()): Promise<void> {
    const user = await this.users.findByEmail(email)

    if (!user || user.status !== ACTIVE_USER_STATUS || !user.passwordHash) {
      // Logged, because "the mail never arrived" is a support question and
      // this is the answer to it. Not returned, for the reason above.
      this.logger.log(
        { emailDomain: email.split('@')[1] },
        'Password reset requested for an address that cannot receive one',
      )
      return
    }

    if (await this.overRateLimit(user.id, now)) {
      this.logger.warn(
        { userId: user.id },
        'Password reset rate limit reached; no mail sent',
      )
      return
    }

    const code = randomBytes(32).toString('base64url')

    await this.dataSource.transaction(async (manager) => {
      // Asking again invalidates the earlier link, per
      // docs/01-architecture.md#auth. Marking spent rather than deleting keeps
      // the row for the day retention holds it, so "I clicked the old link"
      // has an answer.
      // `IsNull()`, not `null`: TypeORM refuses a bare null in a where clause
      // rather than turning it into `IS NULL`, and it throws at runtime with
      // nothing to catch it at compile time.
      await manager.update(
        PasswordResetToken,
        { userId: user.id, usedAt: IsNull() },
        { usedAt: now },
      )

      await manager.insert(PasswordResetToken, {
        userId: user.id,
        tokenHash: this.tokens.hashRefreshToken(code),
        expiresAt: new Date(now.getTime() + this.ttlMinutes * 60_000),
        usedAt: null,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })

      // `enqueueSystem`, not `enqueue`: this endpoint is @Public(), so there
      // is no org context to read, and a reset belongs to the account rather
      // than to any one of the person's organisations.
      await this.email.enqueueSystem(manager, {
        recipientId: user.id,
        template: PASSWORD_RESET_TEMPLATE,
        payload: {
          name: user.nickname,
          url: `${this.appUrl}/reset-password?code=${code}`,
          expiresInMinutes: this.ttlMinutes,
        },
      })
    })
  }

  /**
   * Spends a link and sets the new password, then revokes **every** session —
   * this one included, since there is no "current" one to keep: the person is
   * not signed in, and if the reason for the reset was a break-in, the
   * intruder's sessions are exactly what has to go.
   */
  async reset(code: string, newPassword: string, now = new Date()) {
    const hash = this.tokens.hashRefreshToken(code)

    // 🔒 One statement, the same shape as session rotation: the conditions
    // that make the token usable live in the UPDATE's own WHERE. A SELECT
    // followed by an UPDATE lets two clicks on the same link both pass the
    // check, and single-use is the property this whole flow rests on.
    const claimed = await this.resets.queryBuilder
      .base('token')
      .update(PasswordResetToken)
      .set({ usedAt: now, updatedAt: now })
      .where('token_hash = :hash', { hash })
      .andWhere('used_at IS NULL')
      .andWhere('expires_at > :now', { now })
      .returning(['userId'])
      .execute()

    const rows = claimed.raw as { user_id: string }[]
    // Wrong, already spent, or expired — one answer for all three, so a
    // guessed code cannot be told apart from a stale one.
    if (rows.length === 0 || typeof rows[0]?.user_id !== 'string') {
      throw invalidResetCode()
    }

    const userId = rows[0].user_id

    await this.users.setPasswordHash(
      userId,
      await this.passwords.hash(newPassword),
      SYSTEM_USER_ID,
      now,
    )

    const signedOutSessions = await this.sessions.revokeAllForUser(
      userId,
      'password_reset',
      undefined,
      now,
    )

    // Every session, cache included and with nothing spared. `changePassword`
    // keeps the caller's; here there is no caller to keep — the person is not
    // signed in, and if the reason for the reset was a break-in then the
    // intruder's session is precisely the one that must not survive another
    // thirty seconds.
    this.auth.forgetSessions(userId)

    return { signedOutSessions }
  }

  /**
   * Counted from rows rather than from memory, for the reason the login
   * lockout is: a counter a restart clears is a counter an attacker can clear,
   * and it has to hold across instances.
   */
  private async overRateLimit(userId: string, now: Date): Promise<boolean> {
    const since = new Date(now.getTime() - 60 * 60_000)

    const recent = await this.resets.queryBuilder
      .base('token')
      .where('token.userId = :userId', { userId })
      .andWhere('token.createdAt > :since', { since })
      .getCount()

    return recent >= this.maxPerHour
  }
}

/**
 * 400 rather than 401: nothing about the caller's identity was rejected —
 * there is no identity yet. What failed is the code in the URL.
 */
function invalidResetCode(): ApiException {
  return new ApiException(
    HttpStatus.BAD_REQUEST,
    AUTH_ERROR_CODES.INVALID_RESET_CODE,
    'That password reset link is invalid or has expired',
  )
}
