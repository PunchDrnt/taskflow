import { AsyncResource } from 'node:async_hooks'
import { describe, expect, it } from 'vitest'

import { openRequestContext } from '#shared/org-scope/request-context'

import type { StorageService } from '../../storage/storage.service'
import type { UserService } from '../user/user.service'
import { MeController } from './me.controller'

/**
 * What happens to the picture somebody just replaced.
 *
 * The rest of `/me` is covered end to end by `test/account.spec.ts`; this is
 * here because the rule is a *negative* — an object that should no longer
 * exist — and the only place to observe it is the call that removes it.
 *
 * Every dependency is a stub but the two that matter. `me()` is never reached:
 * each test stops at the delete, which is the whole subject.
 */
const CONTEXT = {
  orgId: null,
  userId: 'user-1',
  orgRole: null,
  sessionId: null,
}

const PROFILE = {
  username: 'somchai',
  name: 'Somchai',
  nickname: 'Som',
  phone: null,
}

/**
 * One HTTP request, as far as AsyncLocalStorage can tell — the same fence
 * `request-context.spec.ts` uses, and for the same reason: `enterWith` outside
 * an async resource leaks into the next test.
 */
const inRequest = <T>(fn: () => Promise<T>): Promise<T> =>
  new AsyncResource('test-request').runInAsyncScope(fn)

/** The controller with only the two collaborators this behaviour touches. */
function controllerWith(stored: string | null) {
  const removed: string[] = []

  const users = {
    findById: () => Promise.resolve({ avatarUrl: stored }),
    updateProfile: () => Promise.resolve(),
  } as unknown as UserService

  const storage = {
    remove: (key: string) => {
      removed.push(key)

      return Promise.resolve()
    },
  } as unknown as StorageService

  const controller = new MeController(
    {} as never,
    users,
    {} as never,
    {} as never,
    storage,
  )

  const save = (avatarUrl: string | null) =>
    inRequest(async () => {
      openRequestContext()(CONTEXT)

      // `me()` reads services this test does not stub, so the reply is thrown
      // away — the delete has already happened by then.
      await controller
        .updateProfile({ ...PROFILE, avatarUrl })
        .catch(() => undefined)
    })

  return { removed, save }
}

describe('replacing a profile picture', () => {
  it('takes the old object out of the bucket', async () => {
    // Ten changes used to leave ten objects with one of them referenced. The
    // row is the only index of the bucket, so the moment it stops naming an
    // object is the last moment that object can be found at all.
    const { removed, save } = controllerWith('user/user-1/avatar/old.webp')

    await save('user/user-1/avatar/new.webp')

    expect(removed).toEqual(['user/user-1/avatar/old.webp'])
  })

  it('leaves a picture that has not changed', async () => {
    const key = 'user/user-1/avatar/same.webp'
    const { removed, save } = controllerWith(key)

    // Saving a phone number is still a PATCH carrying the avatar it already
    // had. Deleting on every save would delete the current picture.
    await save(key)

    expect(removed).toEqual([])
  })

  it('🔒 never deletes by a URL somebody else hosts', async () => {
    const { removed, save } = controllerWith('https://example.com/me.png')

    await save('user/user-1/avatar/new.webp')

    expect(removed).toEqual([])
  })

  it('clearing the picture still removes the object', async () => {
    // Null is a change like any other: the row stops naming it, so nothing
    // will ever name it again.
    const { removed, save } = controllerWith('user/user-1/avatar/old.webp')

    await save(null)

    expect(removed).toEqual(['user/user-1/avatar/old.webp'])
  })

  it('has nothing to do when there was no picture', async () => {
    const { removed, save } = controllerWith(null)

    await save('user/user-1/avatar/first.webp')

    expect(removed).toEqual([])
  })
})
