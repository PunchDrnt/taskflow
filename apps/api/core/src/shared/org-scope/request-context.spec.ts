import { AsyncResource } from 'node:async_hooks'
import { Agent, createServer, get, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  enterRequestContext,
  getRequestContext,
  requireOrgContext,
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
    expect(() => requireOrgContext()).toThrow(/No request context/)
  })

  it('models "signed in, no org" rather than faking one', () => {
    // A person in three companies who has not picked yet, and a system-role
    // account that belongs to none. Both are signed in; neither has an org.
    runWithRequestContext({ orgId: null, userId: 'user-1' }, () => {
      expect(requireRequestContext().userId).toBe('user-1')

      // Anything org-scoped goes through requireOrgContext, so this state
      // cannot reach a query as a null org_id that silently matches nothing.
      expect(() => requireOrgContext()).toThrow(/No organisation/)
    })
  })

  it('narrows orgId to a string when there is one', () => {
    runWithRequestContext(context, () => {
      expect(requireOrgContext()).toEqual(context)
    })
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
        seen.push(requireOrgContext().orgId)
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
        return requireOrgContext().orgId
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

/**
 * 🔒 The guard's actual shape, over a real HTTP server.
 *
 * `AuthGuard` looks the session up and *then* calls `enterRequestContext`, so
 * the `enterWith` happens after an await. That ordering is not covered by the
 * cases above, which all enter first, and it is the one that carries the risk:
 * a store entered after an await is visible to the caller only when the
 * caller's async resource has none of its own.
 *
 * That condition is exactly what Node's HTTP server provides and exactly what
 * an in-process harness does not — nest two `AsyncResource`s and the second
 * inherits the first's store, which is why `auth.guard.spec.ts` asserts on the
 * call rather than on the store. Measured here instead, where the shape is
 * real: parallel requests, and sequential ones sharing a keep-alive socket.
 */
describe('enterRequestContext over HTTP', () => {
  let server: Server
  let origin: string
  let requestCount = 0

  beforeAll(async () => {
    server = createServer(async (request, response) => {
      const orgId = `org-${(requestCount += 1)}`

      // The guard: a session lookup, then the context, then the handler.
      await new Promise((resolve) => setTimeout(resolve, 5))
      enterRequestContext({ orgId, userId: `user-${orgId}` })
      await new Promise((resolve) => setTimeout(resolve, 5))

      response.end(
        JSON.stringify({ expected: orgId, seen: getRequestContext()?.orgId }),
      )
    })

    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address()
    origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`
  })

  afterAll(() => {
    server?.close()
  })

  const fetchOrg = (agent?: Agent) =>
    new Promise<{ expected: string; seen: string | undefined }>((resolve) => {
      get(origin, agent ? { agent } : {}, (response) => {
        let body = ''
        response.on('data', (chunk) => (body += String(chunk)))
        response.on('end', () => resolve(JSON.parse(body)))
      })
    })

  it('gives each of 8 parallel requests its own context', async () => {
    const seen = await Promise.all(Array.from({ length: 8 }, () => fetchOrg()))

    expect(seen.filter((row) => row.expected !== row.seen)).toEqual([])
  })

  it('does not leak between requests on one keep-alive connection', async () => {
    // The case a fresh socket per request would hide: the second request
    // arrives on the resource the first one just wrote to.
    const agent = new Agent({ keepAlive: true, maxSockets: 1 })

    const seen = []
    for (let index = 0; index < 4; index += 1) seen.push(await fetchOrg(agent))
    agent.destroy()

    expect(seen.filter((row) => row.expected !== row.seen)).toEqual([])
    expect(seen).toHaveLength(4)
  })
})
