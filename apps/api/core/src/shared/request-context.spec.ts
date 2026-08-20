import { describe, expect, it } from 'vitest'

import {
  getRequestContext,
  requireRequestContext,
  runWithRequestContext,
} from './request-context'

const context = { orgId: 'org-1', userId: 'user-1' }

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
