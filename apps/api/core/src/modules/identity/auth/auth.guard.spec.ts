import type { ExecutionContext } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import type { CookieOptions, Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_ERROR_CODES } from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { IS_PUBLIC, SKIP_ORG_SCOPE } from '#shared/http/route-metadata'
import { enterRequestContext } from '#shared/org-scope/request-context'

import type { Env } from '../../../config/env'
import type { Membership } from '../../organization/membership.service'
import {
  ACCESS_TOKEN_COOKIE,
  ACTIVE_ORG_COOKIE,
  AuthCookies,
} from './auth.cookies'
import { AuthGuard } from './auth.guard'
import type { AuthenticatedUser, AuthService } from './auth.service'
import { ACCESS_TOKEN_TTL_SECONDS, TokenService } from './token.service'

/**
 * The guard's own call, spied on rather than read back out of
 * AsyncLocalStorage afterwards.
 *
 * `enterWith` is issued *after* an await here, and a store entered that way is
 * reliably visible to the caller only when the caller's async resource has
 * none of its own — which is exactly one HTTP request, and is not reproducible
 * in a test harness where every case is nested inside the same parent
 * resource. Measured: over a real server it holds for parallel requests and
 * for sequential ones on a keep-alive connection alike, and
 * request-context.spec.ts pins that. What is left for this file is the guard's
 * decision — whether it enters a context at all, and which org it names.
 */
vi.mock('#shared/org-scope/request-context', () => ({
  enterRequestContext: vi.fn(),
}))

const entered = vi.mocked(enterRequestContext)

const ACME = '11111111-1111-4111-8111-111111111111'
const GLOBEX = '22222222-2222-4222-8222-222222222222'
const USER = 'user-1'
const SESSION = 'session-1'

const membership = (orgId: string): Membership => ({
  orgId,
  name: orgId,
  slug: orgId,
  role: 'member',
})

const tokens = new TokenService(
  new JwtService({
    secret: 'test-secret-at-least-thirty-two-characters',
    signOptions: { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    verifyOptions: { algorithms: ['HS256'] },
  }),
)

const cookies = new AuthCookies({
  get: () => 'development',
} as unknown as ConfigService<Env, true>)

let cleared: string[] = []

/** A request with the given cookies, and a response that records clears. */
function httpContext(
  jar: Record<string, string>,
  metadata: { public?: boolean; skipOrgScope?: boolean } = {},
): ExecutionContext {
  const response = {
    cookie: () => response,
    clearCookie: (name: string, _options: CookieOptions) => {
      cleared.push(name)
      return response
    },
  } as unknown as Response

  const handler = () => undefined
  if (metadata.public) Reflect.defineMetadata(IS_PUBLIC, true, handler)
  if (metadata.skipOrgScope) {
    Reflect.defineMetadata(SKIP_ORG_SCOPE, true, handler)
  }

  return {
    getHandler: () => handler,
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({ cookies: jar }) as unknown as Request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext
}

function guardFor(caller: AuthenticatedUser | null): AuthGuard {
  const auth = {
    authenticate: () => Promise.resolve(caller),
  } as unknown as AuthService

  return new AuthGuard(new Reflector(), auth, tokens, cookies)
}

const signedIn = (memberships: Membership[]): AuthenticatedUser => ({
  userId: USER,
  sessionId: SESSION,
  memberships,
})

const accessToken = tokens.signAccessToken({ sub: USER, sid: SESSION })

/** The code of the ApiException a call threw. */
async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
    return 'did not throw'
  } catch (error) {
    return error instanceof ApiException ? error.code : String(error)
  }
}

beforeEach(() => {
  cleared = []
  entered.mockClear()
})

describe('AuthGuard', () => {
  it('lets a @Public() route through without touching the context', async () => {
    await expect(
      guardFor(null).canActivate(httpContext({}, { public: true })),
    ).resolves.toBe(true)

    expect(entered).not.toHaveBeenCalled()
  })

  it('refuses a request with no access token', async () => {
    expect(
      await codeOf(
        guardFor(signedIn([membership(ACME)])).canActivate(httpContext({})),
      ),
    ).toBe('UNAUTHENTICATED')
  })

  it('refuses a token this API did not sign', async () => {
    const foreign = new TokenService(
      new JwtService({
        secret: 'another-secret-at-least-thirty-two-chars',
        signOptions: { algorithm: 'HS256', expiresIn: 900 },
      }),
    )

    expect(
      await codeOf(
        guardFor(signedIn([membership(ACME)])).canActivate(
          httpContext({
            [ACCESS_TOKEN_COOKIE]: foreign.signAccessToken({
              sub: USER,
              sid: SESSION,
            }),
          }),
        ),
      ),
    ).toBe('UNAUTHENTICATED')
  })

  it('refuses a valid token whose session is gone', async () => {
    // Logged out, revoked, expired, or the account was deactivated — the token
    // cannot express any of it, which is why the session is read every request.
    expect(
      await codeOf(
        guardFor(null).canActivate(
          httpContext({ [ACCESS_TOKEN_COOKIE]: accessToken }),
        ),
      ),
    ).toBe('UNAUTHENTICATED')
  })

  it('refuses a token whose sub does not match the session it names', async () => {
    // A forged pairing: our own signature over somebody else's session id.
    const mismatched = tokens.signAccessToken({
      sub: 'user-2',
      sid: SESSION,
    })

    expect(
      await codeOf(
        guardFor(signedIn([membership(ACME)])).canActivate(
          httpContext({ [ACCESS_TOKEN_COOKIE]: mismatched }),
        ),
      ),
    ).toBe('UNAUTHENTICATED')
  })

  it('opens a context for the only org, with no cookie needed', async () => {
    await expect(
      guardFor(signedIn([membership(ACME)])).canActivate(
        httpContext({ [ACCESS_TOKEN_COOKIE]: accessToken }),
      ),
    ).resolves.toBe(true)

    expect(entered).toHaveBeenCalledWith({ userId: USER, orgId: ACME })
  })

  it('honours the active_org cookie when they belong to several', async () => {
    await guardFor(
      signedIn([membership(ACME), membership(GLOBEX)]),
    ).canActivate(
      httpContext({
        [ACCESS_TOKEN_COOKIE]: accessToken,
        [ACTIVE_ORG_COOKIE]: GLOBEX,
      }),
    )

    expect(entered).toHaveBeenCalledWith({ userId: USER, orgId: GLOBEX })
  })

  it('asks somebody in several orgs to choose', async () => {
    expect(
      await codeOf(
        guardFor(signedIn([membership(ACME), membership(GLOBEX)])).canActivate(
          httpContext({ [ACCESS_TOKEN_COOKIE]: accessToken }),
        ),
      ),
    ).toBe(AUTH_ERROR_CODES.ORG_NOT_SELECTED)
  })

  it('sends somebody in no org to a different screen', async () => {
    // A separate code, not the same one — see AUTH_ERROR_CODES.
    expect(
      await codeOf(
        guardFor(signedIn([])).canActivate(
          httpContext({ [ACCESS_TOKEN_COOKIE]: accessToken }),
        ),
      ),
    ).toBe(AUTH_ERROR_CODES.NO_ORGANIZATION)
  })

  it('🔒 refuses a cookie naming an org they are not in, and clears it', async () => {
    // Two halves. It must not answer for the other org — and it must not
    // answer for a *different* one either, even the one they do belong to:
    // silently substituting an org the caller did not ask for is how a task
    // ends up filed under the wrong company. So it refuses, and clears the
    // stale choice so the retry resolves normally rather than 403ing forever.
    expect(
      await codeOf(
        guardFor(signedIn([membership(ACME)])).canActivate(
          httpContext({
            [ACCESS_TOKEN_COOKIE]: accessToken,
            [ACTIVE_ORG_COOKIE]: GLOBEX,
          }),
        ),
      ),
    ).toBe(AUTH_ERROR_CODES.ORG_NOT_SELECTED)

    expect(cleared).toEqual([ACTIVE_ORG_COOKIE])
    // Refused means refused: no context is opened on the way out.
    expect(entered).not.toHaveBeenCalled()
  })

  it('lets a @SkipOrgScope() route run with no org at all', async () => {
    // The Home screen and POST /me/active-org: signed in, acting for nobody.
    // Null reaches the context rather than an invented org, and everything
    // org-scoped throws on it via requireOrgContext.
    await expect(
      guardFor(signedIn([membership(ACME), membership(GLOBEX)])).canActivate(
        httpContext(
          { [ACCESS_TOKEN_COOKIE]: accessToken },
          { skipOrgScope: true },
        ),
      ),
    ).resolves.toBe(true)

    expect(entered).toHaveBeenCalledWith({ userId: USER, orgId: null })
  })

  it('still clears a stale cookie on a @SkipOrgScope() route', async () => {
    await guardFor(signedIn([membership(ACME)])).canActivate(
      httpContext(
        {
          [ACCESS_TOKEN_COOKIE]: accessToken,
          [ACTIVE_ORG_COOKIE]: GLOBEX,
        },
        { skipOrgScope: true },
      ),
    )

    expect(cleared).toEqual([ACTIVE_ORG_COOKIE])
  })
})
