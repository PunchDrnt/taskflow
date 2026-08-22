import { AsyncResource } from 'node:async_hooks'
import { describe, expect, it } from 'vitest'

import {
  enterRequestContext,
  getRequestContext,
  requireRequestContext,
  runWithRequestContext,
} from './request-context'

const context = { orgId: 'org-1', userId: 'user-1' }

/**
 * One HTTP request, as far as AsyncLocalStorage can tell. Node's HTTP server
 * gives every request its own async resource, and that boundary is the only
 * thing keeping one `enterWith` out of the next request — so a test that calls
 * `enterRequestContext` bare would prove nothing and leak into its neighbours.
 */
const inRequest = <T>(fn: () => Promise<T>): Promise<T> =>
  new AsyncResource('test-request').runInAsyncScope(fn)

describe('request context', () => {
  it('is undefined outside a request', () => {
    expect(getRequestContext()).toBeUndefined()
  })

  it('throws rather than guessing when one is required', () => {
    expect(() => requireRequestContext()).toThrow(/No request context/)
  })

  it('is visible inside the callback', () => {
    runWithRequestContext(context, () => {
      expect(requireRequestContext()).toEqual(context)
    })
  })

  it('survives awaits, which is the whole reason for AsyncLocalStorage', async () => {
    await runWithRequestContext(context, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(requireRequestContext()).toEqual(context)
    })
  })

  it('does not leak out of the callback', async () => {
    await runWithRequestContext(context, async () => {
      await Promise.resolve()
    })

    expect(getRequestContext()).toBeUndefined()
  })

  it('keeps concurrent requests apart', async () => {
    const seen: string[] = []

    const request = (orgId: string, delay: number) =>
      runWithRequestContext({ orgId, userId: `user-${orgId}` }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delay))
        seen.push(requireRequestContext().orgId)
      })

    // The slower request starts first, so a shared mutable "current org"
    // would report org-b for both.
    await Promise.all([request('org-a', 20), request('org-b', 1)])

    expect(seen).toEqual(['org-b', 'org-a'])
  })

  it('nests, so a job acting for another org restores the outer one', () => {
    runWithRequestContext(context, () => {
      runWithRequestContext({ orgId: 'org-2', userId: 'system' }, () => {
        expect(requireRequestContext().orgId).toBe('org-2')
      })

      expect(requireRequestContext().orgId).toBe('org-1')
    })
  })
})

/**
 * 🔒 These pin the mechanism AuthGuard is required to use. A failure here is a
 * cross-org leak, not an ordinary bug — see checklists/phase-1.md §1.
 */
describe('enterRequestContext', () => {
  it('outlives the call that set it, which run() cannot do', async () => {
    await inRequest(async () => {
      // The shape of canActivate: set the context, return, let something else
      // call the handler. runWithRequestContext would have closed by now.
      const canActivate = (): boolean => {
        enterRequestContext(context)
        return true
      }

      expect(canActivate()).toBe(true)
      expect(requireRequestContext()).toEqual(context)
    })
  })

  it('survives awaits', async () => {
    await inRequest(async () => {
      enterRequestContext(context)

      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(requireRequestContext()).toEqual(context)
    })
  })

  it('keeps 20 concurrent requests apart', async () => {
    const orgOf = async (index: number): Promise<string> =>
      inRequest(async () => {
        enterRequestContext({ orgId: `org-${index}`, userId: `user-${index}` })

        // Interleave: the later requests finish first, so a store shared
        // across requests would answer with whoever entered last.
        await new Promise((resolve) => setTimeout(resolve, 20 - index))
        return requireRequestContext().orgId
      })

    const seen = await Promise.all(
      Array.from({ length: 20 }, (_, index) => orgOf(index)),
    )

    expect(seen).toEqual(Array.from({ length: 20 }, (_, i) => `org-${i}`))
  })

  it('does not reach a request that never entered one', async () => {
    await inRequest(async () => {
      enterRequestContext(context)
      await Promise.resolve()
    })

    await inRequest(async () => {
      expect(getRequestContext()).toBeUndefined()
    })
  })
})
