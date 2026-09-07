import type { ConfigService } from '@nestjs/config'
import type { CookieOptions, Response } from 'express'
import { describe, expect, it } from 'vitest'

import type { Env } from '../../../config/env'
import {
  ACCESS_TOKEN_COOKIE,
  ACTIVE_ORG_COOKIE,
  AuthCookies,
  REFRESH_TOKEN_COOKIE,
  TWO_FACTOR_COOKIE,
} from './auth.cookies'

interface SetCall {
  name: string
  value: string
  options: CookieOptions
}

function recorder(): {
  response: Response
  set: SetCall[]
  cleared: SetCall[]
} {
  const set: SetCall[] = []
  const cleared: SetCall[] = []

  const response = {
    cookie(name: string, value: string, options: CookieOptions) {
      set.push({ name, value, options })
      return this
    },
    clearCookie(name: string, options: CookieOptions) {
      cleared.push({ name, value: '', options })
      return this
    },
  } as unknown as Response

  return { response, set, cleared }
}

function cookiesFor(nodeEnv: Env['NODE_ENV']): AuthCookies {
  return new AuthCookies({
    get: () => nodeEnv,
  } as unknown as ConfigService<Env, true>)
}

const cookies = cookiesFor('production')

describe('cookie attributes', () => {
  it.each([ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, ACTIVE_ORG_COOKIE])(
    '%s is httpOnly and SameSite=Lax',
    (name) => {
      // httpOnly: an XSS gets the page's session, not a token it can send
      // somewhere else. Lax: every browser request is same-origin because each
      // web app proxies its own /api/*, which is what replaces a CSRF token.
      const options = cookies.optionsFor(name)

      expect(options.httpOnly).toBe(true)
      expect(options.sameSite).toBe('lax')
    },
  )

  it('scopes every cookie to the whole origin', () => {
    // The refresh token and the challenge were scoped to `/api/v1/auth` and
    // were widened on purpose: a path-scoped cookie is not sent with page
    // requests, so the Next proxy and Server Actions never held the token and
    // could not renew a session. See COOKIE_PATH in auth.cookies.ts.
    //
    // Pinned so that narrowing one again is a failing test rather than a
    // Thursday spent working out why every cold load renders signed out.
    expect(cookies.optionsFor(REFRESH_TOKEN_COOKIE).path).toBe('/')
    expect(cookies.optionsFor(TWO_FACTOR_COOKIE).path).toBe('/')

    expect(cookies.optionsFor(ACCESS_TOKEN_COOKIE).path).toBe('/')
    expect(cookies.optionsFor(ACTIVE_ORG_COOKIE).path).toBe('/')
  })

  it('sets Secure in production and not in development', () => {
    // The one attribute that varies: a Secure cookie is dropped over plain
    // http, so pinning it on breaks `yarn dev` and pinning it off ships tokens
    // in the clear.
    expect(cookies.optionsFor(ACCESS_TOKEN_COOKIE).secure).toBe(true)
    expect(
      cookiesFor('development').optionsFor(ACCESS_TOKEN_COOKIE).secure,
    ).toBe(false)
  })

  it('outlives the access token with the refresh and org cookies', () => {
    const access = cookies.optionsFor(ACCESS_TOKEN_COOKIE).maxAge!

    expect(access).toBe(15 * 60 * 1000)
    expect(cookies.optionsFor(REFRESH_TOKEN_COOKIE).maxAge).toBe(
      15 * 24 * 60 * 60 * 1000,
    )
    // The chosen org has to survive a browser restart, or it is re-picked
    // every morning.
    expect(cookies.optionsFor(ACTIVE_ORG_COOKIE).maxAge).toBeGreaterThan(access)
  })
})

describe('setting and clearing', () => {
  it('sets both session cookies with the attributes above', () => {
    const { response, set } = recorder()

    cookies.setSession(response, { accessToken: 'a', refreshToken: 'r' })

    expect(set.map(({ name, value }) => [name, value])).toEqual([
      [ACCESS_TOKEN_COOKIE, 'a'],
      [REFRESH_TOKEN_COOKIE, 'r'],
    ])
    for (const call of set) {
      expect(call.options).toEqual(cookies.optionsFor(call.name))
    }
  })

  it('clears with the attributes each cookie was set with', () => {
    // A browser only replaces a cookie whose name, path and domain match, so a
    // clear that disagrees on path leaves the original being sent forever.
    const { response, cleared } = recorder()

    cookies.clearSession(response)

    expect(cleared.map(({ name }) => name)).toEqual([
      ACCESS_TOKEN_COOKIE,
      REFRESH_TOKEN_COOKIE,
      ACTIVE_ORG_COOKIE,
      // A half-finished login has no business outliving the session it was
      // going to create.
      TWO_FACTOR_COOKIE,
    ])
    for (const call of cleared) {
      const { maxAge: _maxAge, ...expected } = cookies.optionsFor(call.name)

      expect(call.options).toEqual(expected)
      // Express writes Expires from maxAge; a past date alongside its own
      // Max-Age=0 is two ways of saying the same thing.
      expect(call.options.maxAge).toBeUndefined()
    }
  })

  it('drops the active org on logout — it means nothing without a session', () => {
    const { response, cleared } = recorder()

    cookies.clearActiveOrg(response)

    expect(cleared).toHaveLength(1)
    expect(cleared[0]!.name).toBe(ACTIVE_ORG_COOKIE)
  })

  it('sets the active org on the path every request uses', () => {
    const { response, set } = recorder()

    cookies.setActiveOrg(response, 'org-1')

    expect(set).toEqual([
      {
        name: ACTIVE_ORG_COOKIE,
        value: 'org-1',
        options: cookies.optionsFor(ACTIVE_ORG_COOKIE),
      },
    ])
  })
})
