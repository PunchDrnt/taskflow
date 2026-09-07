import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Env } from '../../../config/env'
import type { User } from '../user/user.entity'
import { UserService } from '../user/user.service'

/**
 * Locking an account after repeated failures, per
 * docs/04-features/phase-1.md#auth--users.
 *
 * The state is two columns on `iam.users`, not a Map. A counter a restart
 * clears is a counter an attacker can clear by making the process restart, and
 * it would not hold across instances either.
 *
 * Three rules that look like details and are not:
 *
 * - **An attempt during a lock does not extend it.** Otherwise anybody can
 *   keep a colleague locked out forever by failing on their address.
 * - **An unknown address counts nothing.** There is no row to lock, and
 *   pretending there were would answer "does this email exist" for free.
 * - **The reply says locked, never for how long.** That does confirm the
 *   address exists; for a hundred-person internal tool that is already common
 *   knowledge, and the person hitting the lock is nearly always its owner.
 */
@Injectable()
export class LockoutService {
  private readonly maxAttempts: number
  private readonly lockMinutes: number

  constructor(
    config: ConfigService<Env, true>,
    private readonly users: UserService,
  ) {
    this.maxAttempts = config.get('LOGIN_MAX_ATTEMPTS', { infer: true })
    this.lockMinutes = config.get('LOGIN_LOCK_MINUTES', { infer: true })
  }

  isLocked(user: Pick<User, 'lockedUntil'>, now = new Date()): boolean {
    return user.lockedUntil !== null && user.lockedUntil > now
  }

  /**
   * Counts one failure and locks on the Nth. Returns whether this attempt is
   * the one that locked the account, so the caller can say so.
   *
   * A lock that has already expired starts the count over rather than leaving
   * it at the ceiling, so the shape of the policy is *N attempts per window*
   * — bounded, and the same bound after the tenth lock as after the first.
   * Carrying the count forward would mean one mistyped password after waiting
   * fifteen minutes buys another fifteen, which punishes the account's owner
   * and slows an attacker by nothing.
   *
   * Only reached when the account is *not* currently locked: the caller checks
   * `isLocked` first and returns without counting, which is what keeps an
   * attempt during a lock from extending it.
   */
  async recordFailure(user: User, now = new Date()): Promise<boolean> {
    const lockExpired = user.lockedUntil !== null && user.lockedUntil <= now
    const attempts = (lockExpired ? 0 : user.failedLoginAttempts) + 1
    const locked = attempts >= this.maxAttempts

    await this.users.setLockoutState(user.id, {
      failedLoginAttempts: attempts,
      lockedUntil: locked
        ? new Date(now.getTime() + this.lockMinutes * 60_000)
        : null,
    })

    return locked
  }

  /** A successful login. Both columns go back to their resting state. */
  async reset(user: User): Promise<void> {
    if (user.failedLoginAttempts === 0 && user.lockedUntil === null) return

    await this.users.setLockoutState(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
    })
  }
}
