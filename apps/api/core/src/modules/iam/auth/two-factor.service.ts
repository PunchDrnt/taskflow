import { HttpStatus, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { AUTH_ERROR_CODES } from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'

import type { Env } from '../../../config/env'
import { UserService } from '../user/user.service'
import { PasswordService } from './password.service'
import { RecoveryCode } from './recovery-code.entity'
import { SessionService } from './session.service'
import { TotpCredential } from './totp-credential.entity'
import { TotpService } from './totp.service'

/** What the setup screen needs to draw a QR code and offer a manual fallback. */
export interface TotpSetup {
  secret: string
  otpauthUrl: string
}

/**
 * Opt-in two-factor authentication over TOTP.
 *
 * Opt-in for everybody and enforced on nobody, which is a deliberate step past
 * what docs/03-roadmap.md wrote down ("a later phase, and mandatory for system
 * roles"). Mandatory needs a system role to make mandatory, and `iam.user_roles`
 * has had no rows since Phase 0; shipping the voluntary half now means the
 * enforcement is a policy check later rather than a feature.
 *
 * The rows live here. `TotpService` owns the arithmetic and the key.
 */
@Injectable()
export class TwoFactorService {
  private readonly maxAttempts: number
  private readonly lockMinutes: number

  constructor(
    @InjectOrgRepository(TotpCredential)
    private readonly credentials: OrgScopedRepository<TotpCredential>,
    @InjectOrgRepository(RecoveryCode)
    private readonly recoveryCodes: OrgScopedRepository<RecoveryCode>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly users: UserService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly totp: TotpService,
    config: ConfigService<Env, true>,
  ) {
    this.maxAttempts = config.get('LOGIN_MAX_ATTEMPTS', { infer: true })
    this.lockMinutes = config.get('LOGIN_LOCK_MINUTES', { infer: true })
  }

  /** Confirmed only. An abandoned setup must never stand between anyone and their account. */
  async isEnabled(userId: string): Promise<boolean> {
    return this.credentials.queryBuilder
      .base('totp')
      .where('totp.userId = :userId', { userId })
      .andWhere('totp.confirmedAt IS NOT NULL')
      .getExists()
  }

  /**
   * Mints a secret and hands back what the authenticator app needs.
   *
   * The password is checked even though the caller already holds a session,
   * and for a sharper reason than the password change: somebody who has taken
   * a session could otherwise enrol *their* authenticator and lock the owner
   * out of their own account.
   *
   * Starting again replaces any unconfirmed row, so an abandoned attempt never
   * becomes the secret that gets confirmed later.
   */
  async startSetup(
    userId: string,
    password: string,
    now = new Date(),
  ): Promise<TotpSetup> {
    const user = await this.requirePassword(userId, password)

    if (await this.isEnabled(userId)) throw alreadyEnabled()

    const secret = this.totp.createSecret()

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(TotpCredential, { userId })
      await manager.insert(TotpCredential, {
        userId,
        secretEncrypted: this.totp.encrypt(secret),
        confirmedAt: null,
        lastUsedStep: null,
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: now,
        createdBy: userId,
        updatedAt: now,
        updatedBy: userId,
      })
    })

    return { secret, otpauthUrl: this.totp.otpauthUrl(secret, user.email) }
  }

  /**
   * Turns it on, once a code proves the secret reached the app, and returns
   * the recovery codes — the only time they are ever readable.
   */
  async enable(
    userId: string,
    code: string,
    now = new Date(),
  ): Promise<{ recoveryCodes: string[] }> {
    const credential = await this.credentials.queryBuilder
      .base('totp')
      .where('totp.userId = :userId', { userId })
      .getOne()

    if (!credential) throw setupNotStarted()
    if (credential.confirmedAt !== null) throw alreadyEnabled()

    const step = this.totp.stepFor(
      this.totp.decrypt(credential.secretEncrypted),
      code,
      now,
    )
    if (step === null) throw invalidCode()

    const codes = this.totp.createRecoveryCodes()

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        TotpCredential,
        { id: credential.id },
        {
          confirmedAt: now,
          lastUsedStep: step,
          failedAttempts: 0,
          lockedUntil: null,
          updatedAt: now,
          updatedBy: userId,
        },
      )

      // Any codes from a previous enrolment are gone with its credential row,
      // but a re-enrol after a disable must not leave old ones redeemable.
      await manager.delete(RecoveryCode, { userId })
      await manager.insert(
        RecoveryCode,
        codes.map((plain) => ({
          userId,
          codeHash: this.totp.hashRecoveryCode(plain),
          usedAt: null,
          createdAt: now,
          createdBy: userId,
          updatedAt: now,
          updatedBy: userId,
        })),
      )
    })

    return { recoveryCodes: codes }
  }

  /**
   * Off, and everything with it.
   *
   * Every session but the caller's goes too. Turning the second factor off is
   * a reduction in the account's protection, and anything already signed in
   * elsewhere was admitted under the stronger rule.
   */
  async disable(
    userId: string,
    sessionId: string,
    password: string,
    now = new Date(),
  ): Promise<{ signedOutSessions: number }> {
    await this.requirePassword(userId, password)

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(TotpCredential, { userId })
      await manager.delete(RecoveryCode, { userId })
    })

    const signedOutSessions = await this.sessions.revokeAllForUser(
      userId,
      'two_factor_disabled',
      sessionId,
      now,
    )

    return { signedOutSessions }
  }

  /**
   * The login step. Accepts a code from the app or one of the recovery codes,
   * and throws otherwise.
   *
   * Two things a naive version gets wrong, both handled here. A TOTP code is
   * valid for its whole window, so the step it matched is recorded and a step
   * already used is refused — otherwise one code seen over a shoulder works
   * twice. And six digits is a million guesses with a challenge that can be
   * reissued by signing in again, so failures are counted and locked the same
   * way and with the same two env vars as the password lockout.
   */
  async verify(userId: string, code: string, now = new Date()): Promise<void> {
    const credential = await this.credentials.queryBuilder
      .base('totp')
      .where('totp.userId = :userId', { userId })
      .andWhere('totp.confirmedAt IS NOT NULL')
      .getOne()

    if (!credential) throw invalidCode()

    if (credential.lockedUntil !== null && credential.lockedUntil > now) {
      throw twoFactorLocked()
    }

    const step = this.totp.stepFor(
      this.totp.decrypt(credential.secretEncrypted),
      code,
      now,
    )

    // A step at or before the last accepted one is a replay, not a code.
    const fresh =
      step !== null &&
      (credential.lastUsedStep === null || step > credential.lastUsedStep)

    if (fresh) {
      await this.credentials.queryBuilder
        .base('totp')
        .update(TotpCredential)
        .set({
          lastUsedStep: step,
          failedAttempts: 0,
          lockedUntil: null,
          updatedAt: now,
          updatedBy: userId,
        })
        .where('id = :id', { id: credential.id })
        .execute()
      return
    }

    if (await this.spendRecoveryCode(userId, code, now)) return

    // The attempt that trips the lock says so, rather than saying "wrong" and
    // leaving the next one to explain — the same order `AuthService.login`
    // uses for the password lockout, so the two read alike from the client.
    throw (await this.recordFailure(credential, now))
      ? twoFactorLocked()
      : invalidCode()
  }

  /**
   * 🔒 One statement, the same shape as session rotation and the reset token:
   * `used_at IS NULL` lives in the UPDATE's own WHERE. A SELECT followed by an
   * UPDATE lets one code be redeemed twice by two requests arriving together.
   */
  private async spendRecoveryCode(
    userId: string,
    code: string,
    now: Date,
  ): Promise<boolean> {
    const result = await this.recoveryCodes.queryBuilder
      .base('code')
      .update(RecoveryCode)
      .set({ usedAt: now, updatedAt: now, updatedBy: userId })
      .where('user_id = :userId', { userId })
      .andWhere('code_hash = :hash', {
        hash: this.totp.hashRecoveryCode(code),
      })
      .andWhere('used_at IS NULL')
      .returning(['id'])
      .execute()

    return (result.raw as unknown[]).length > 0
  }

  /**
   * Records one wrong code and says whether that was the one that locked it.
   *
   * A lock that has already expired resets the count rather than carrying it,
   * so this is N attempts per window — the same rule and the same reasoning as
   * `LockoutService`, which is also why attempts made during a lock never
   * reach here and so cannot extend it.
   */
  private async recordFailure(
    credential: TotpCredential,
    now: Date,
  ): Promise<boolean> {
    const expired =
      credential.lockedUntil !== null && credential.lockedUntil <= now
    const attempts = (expired ? 0 : credential.failedAttempts) + 1
    const locked = attempts >= this.maxAttempts

    await this.credentials.queryBuilder
      .base('totp')
      .update(TotpCredential)
      .set({
        failedAttempts: locked ? 0 : attempts,
        lockedUntil: locked
          ? new Date(now.getTime() + this.lockMinutes * 60_000)
          : null,
      })
      .where('id = :id', { id: credential.id })
      .execute()

    return locked
  }

  /** How many are left, for the screen that nags people to print more. */
  async remainingRecoveryCodes(userId: string): Promise<number> {
    return this.recoveryCodes.queryBuilder
      .base('code')
      .where('code.userId = :userId', { userId })
      .andWhere('code.usedAt IS NULL')
      .getCount()
  }

  private async requirePassword(userId: string, password: string) {
    const user = await this.users.findById(userId)

    if (
      !user?.passwordHash ||
      !(await this.passwords.verify(user.passwordHash, password))
    ) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        AUTH_ERROR_CODES.WRONG_CURRENT_PASSWORD,
        'Incorrect password',
      )
    }

    return user
  }
}

function invalidCode(): ApiException {
  return new ApiException(
    HttpStatus.UNAUTHORIZED,
    AUTH_ERROR_CODES.INVALID_TWO_FACTOR_CODE,
    'That verification code is wrong or has already been used',
  )
}

function twoFactorLocked(): ApiException {
  return new ApiException(
    HttpStatus.UNAUTHORIZED,
    AUTH_ERROR_CODES.ACCOUNT_LOCKED,
    'Too many wrong verification codes. Please wait a moment.',
  )
}

function alreadyEnabled(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    AUTH_ERROR_CODES.TWO_FACTOR_ALREADY_ENABLED,
    'Two-factor authentication is already switched on',
  )
}

function setupNotStarted(): ApiException {
  return new ApiException(
    HttpStatus.BAD_REQUEST,
    AUTH_ERROR_CODES.TWO_FACTOR_SETUP_NOT_STARTED,
    'Two-factor setup has not been started',
  )
}
