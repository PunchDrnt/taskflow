import type { ConfigService } from '@nestjs/config'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Env } from '../../../config/env'
import type { User } from '../user/user.entity'
import type { UserService } from '../user/user.service'
import { LockoutService } from './lockout.service'

const MAX_ATTEMPTS = 3
const LOCK_MINUTES = 15

interface LockoutState {
  failedLoginAttempts: number
  lockedUntil: Date | null
}

let written: LockoutState[] = []

function lockoutService(): LockoutService {
  const config = {
    get: (key: keyof Env) =>
      key === 'LOGIN_MAX_ATTEMPTS' ? MAX_ATTEMPTS : LOCK_MINUTES,
  } as unknown as ConfigService<Env, true>

  const users = {
    setLockoutState: (_id: string, state: LockoutState) => {
      written.push(state)
      return Promise.resolve()
    },
  } as unknown as UserService

  return new LockoutService(config, users)
}

function user(state: Partial<LockoutState> = {}): User {
  return {
    id: 'user-1',
    failedLoginAttempts: state.failedLoginAttempts ?? 0,
    lockedUntil: state.lockedUntil ?? null,
  } as User
}

const now = new Date('2026-09-03T10:00:00Z')
const lastWrite = (): LockoutState => written[written.length - 1]!

beforeEach(() => {
  written = []
})

describe('isLocked', () => {
  it('is false with no lock, and at the instant the lock ends', () => {
    const lockout = lockoutService()

    expect(lockout.isLocked(user(), now)).toBe(false)
    expect(lockout.isLocked(user({ lockedUntil: now }), now)).toBe(false)
  })

  it('is true one millisecond before the lock ends', () => {
    const lockout = lockoutService()
    const until = new Date(now.getTime() + 1)

    expect(lockout.isLocked(user({ lockedUntil: until }), now)).toBe(true)
  })
})

describe('recordFailure', () => {
  it('counts up to the ceiling without locking', async () => {
    const lockout = lockoutService()

    // n - 1: the last failure that is still only a failure.
    await expect(
      lockout.recordFailure(
        user({ failedLoginAttempts: MAX_ATTEMPTS - 2 }),
        now,
      ),
    ).resolves.toBe(false)

    expect(lastWrite()).toEqual({
      failedLoginAttempts: MAX_ATTEMPTS - 1,
      lockedUntil: null,
    })
  })

  it('locks on the Nth failure, for exactly the configured window', async () => {
    const lockout = lockoutService()

    await expect(
      lockout.recordFailure(
        user({ failedLoginAttempts: MAX_ATTEMPTS - 1 }),
        now,
      ),
    ).resolves.toBe(true)

    expect(lastWrite()).toEqual({
      failedLoginAttempts: MAX_ATTEMPTS,
      lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000),
    })
  })

  it('starts a fresh round once a lock has expired', async () => {
    // N attempts per window, and the same bound after the tenth lock as after
    // the first. Carrying the count forward would mean one mistyped password
    // after waiting fifteen minutes buys another fifteen.
    const lockout = lockoutService()
    const expired = new Date(now.getTime() - 1)

    await expect(
      lockout.recordFailure(
        user({ failedLoginAttempts: MAX_ATTEMPTS, lockedUntil: expired }),
        now,
      ),
    ).resolves.toBe(false)

    expect(lastWrite()).toEqual({ failedLoginAttempts: 1, lockedUntil: null })
  })
})

describe('reset', () => {
  it('clears both columns after a successful login', async () => {
    const lockout = lockoutService()

    await lockout.reset(user({ failedLoginAttempts: 2 }))

    expect(lastWrite()).toEqual({ failedLoginAttempts: 0, lockedUntil: null })
  })

  it('writes nothing when there is nothing to clear', async () => {
    // Every successful login would otherwise be an UPDATE on iam.users,
    // which is the hot-table problem sessions.last_used_at already has.
    await lockoutService().reset(user())

    expect(written).toHaveLength(0)
  })
})
