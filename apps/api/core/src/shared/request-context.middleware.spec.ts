import type { Request, Response } from 'express'
import { describe, expect, it, vi } from 'vitest'

import { getRequestContext } from './request-context'
import { RequestContextMiddleware } from './request-context.middleware'

type AuthedRequest = Request & { auth?: { orgId: string; userId: string } }

const middleware = new RequestContextMiddleware()
const response = {} as Response

describe('RequestContextMiddleware', () => {
  it('makes the context visible to everything downstream of next()', () => {
    const request = {
      auth: { orgId: 'org-1', userId: 'user-1' },
    } as AuthedRequest
    const next = vi.fn(() => {
      expect(getRequestContext()).toEqual({ orgId: 'org-1', userId: 'user-1' })
    })

    middleware.use(request, response, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('leaves no context when the request is unauthenticated', () => {
    const next = vi.fn(() => {
      expect(getRequestContext()).toBeUndefined()
    })

    middleware.use({} as AuthedRequest, response, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('does not leak the context past the request', () => {
    middleware.use(
      { auth: { orgId: 'org-1', userId: 'user-1' } } as AuthedRequest,
      response,
      () => undefined,
    )

    expect(getRequestContext()).toBeUndefined()
  })
})
