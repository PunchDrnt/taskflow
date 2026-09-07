import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { CookieOptions, Response } from 'express'

import {
  ACCESS_TOKEN_COOKIE,
  ACTIVE_ORG_COOKIE,
  REFRESH_TOKEN_COOKIE,
  TWO_FACTOR_COOKIE,
} from '@repo/shared'

import type { Env } from '../../../config/env'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  TWO_FACTOR_CHALLENGE_TTL_SECONDS,
  type Tokens,
} from './token.service'

/**
 * The names come from `@repo/shared` and the attributes stay here.
 *
 * The split is the point: the web app's proxy has to recognise `access_token`
 * to know whether to refresh before a render, so the *name* is shared state
 * between two runtimes — and a name that drifts fails silently, with everyone
 * signed out every fifteen minutes and nothing in any log. The *attributes*
 * are still one place, this file, which is the 🔒 rule the docblock below
 * describes.
 *
 * Re-exported so the four call sites in this module keep importing cookie
 * names from the file that sets cookies.
 */
export {
  ACCESS_TOKEN_COOKIE,
  ACTIVE_ORG_COOKIE,
  REFRESH_TOKEN_COOKIE,
  TWO_FACTOR_COOKIE,
}

/**
 * Every cookie is scoped to the whole origin. **This was `/api/v1/auth` for
 * the refresh token and the two-factor challenge, and widening it was a
 * deliberate trade** — docs/01-architecture.md#auth carries the same note.
 *
 * The narrow scope bought one thing: a request that leaked its `Cookie` header
 * anywhere outside the auth endpoints gave up a fifteen-minute access token
 * rather than a fifteen-day refresh token. What it cost was not obvious until
 * it was measured against a real browser: **a path-scoped cookie is not sent
 * with page requests**, so neither Next's proxy nor a Server Action ever had
 * the token in hand, and renewing a session became something only client-side
 * JavaScript could do. The visible consequence was that any cold load more
 * than fifteen minutes after the last one rendered signed-out and had to
 * repair itself after hydration — which is most cold loads.
 *
 * Both cookies stay `httpOnly`, so no script reads either one at any path, and
 * every request that now carries the refresh token is same-origin to the same
 * server that issued it. The exposure that is actually added is to first-party
 * logging: anything recording a full `Cookie` header now records a longer-
 * lived credential. That is worth knowing about and worth keeping out of logs;
 * it is not worth an architecture where the server cannot renew its own
 * session.
 *
 * The two-factor challenge moves for a reason of its own: a login driven from
 * a Server Action would otherwise work for the password step and fail at the
 * code step, having set a cookie the next action cannot see.
 */
const COOKIE_PATH = '/'

/**
 * 🔒 The one place cookie attributes exist.
 *
 * Every flag below is load-bearing and the reasoning is in
 * docs/01-architecture.md#auth and #csrf:
 *
 * - `httpOnly` — script cannot read the tokens, so an XSS gets what it can do
 *   with the page's own session rather than a token it can exfiltrate.
 * - `sameSite: 'lax'` — every browser request is same-origin, because each web
 *   app proxies its own `/api/*` to this one Nest. That is what makes a CSRF
 *   token unnecessary, and it stops being true the moment anything is served
 *   from a different registrable domain.
 * - `secure` follows NODE_ENV — a Secure cookie is dropped over plain http, so
 *   pinning it on would break `yarn dev` and pinning it off would ship tokens
 *   in the clear. It is the one attribute that has to vary.
 * - `path` — `/` for all four, so the server half of the web app can read them
 *   too. See `COOKIE_PATH` above for what that costs and why it is paid.
 *
 * Spread across four call sites these drift: one `set` forgets `httpOnly`, one
 * `clear` disagrees on `path` and leaves a cookie the browser keeps sending
 * forever. A cookie is only cleared by attributes that match the ones it was
 * set with, which is why clearing goes through here too. A unit test pins all
 * three.
 */
@Injectable()
export class AuthCookies {
  private readonly secure: boolean

  constructor(config: ConfigService<Env, true>) {
    this.secure = config.get('NODE_ENV', { infer: true }) === 'production'
  }

  /** Exposed so the test can assert the attributes rather than infer them. */
  optionsFor(name: string): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      path: COOKIE_PATH,
      maxAge: ttlSecondsFor(name) * 1000,
    }
  }

  /** The challenge, and only for as long as the challenge is good for. */
  setTwoFactorChallenge(response: Response, challenge: string): void {
    response.cookie(
      TWO_FACTOR_COOKIE,
      challenge,
      this.optionsFor(TWO_FACTOR_COOKIE),
    )
  }

  clearTwoFactorChallenge(response: Response): void {
    this.clear(response, TWO_FACTOR_COOKIE)
  }

  setSession(response: Response, tokens: Tokens): void {
    response.cookie(
      ACCESS_TOKEN_COOKIE,
      tokens.accessToken,
      this.optionsFor(ACCESS_TOKEN_COOKIE),
    )
    response.cookie(
      REFRESH_TOKEN_COOKIE,
      tokens.refreshToken,
      this.optionsFor(REFRESH_TOKEN_COOKIE),
    )
  }

  /**
   * Which org the caller is acting for — a *choice*, never a *permission*. It
   * is checked against their memberships on every request, so editing it buys
   * a 403 and nothing else, which is why it needs no signature of its own.
   */
  setActiveOrg(response: Response, orgId: string): void {
    response.cookie(
      ACTIVE_ORG_COOKIE,
      orgId,
      this.optionsFor(ACTIVE_ORG_COOKIE),
    )
  }

  /** A choice that no longer holds must not stick — see resolveActiveOrg. */
  clearActiveOrg(response: Response): void {
    this.clear(response, ACTIVE_ORG_COOKIE)
  }

  /** Logout. The active org goes too: it means nothing without a session. */
  clearSession(response: Response): void {
    this.clear(response, ACCESS_TOKEN_COOKIE)
    this.clear(response, REFRESH_TOKEN_COOKIE)
    this.clear(response, ACTIVE_ORG_COOKIE)
    // A challenge that was never spent has no business outliving the session
    // it was going to create.
    this.clear(response, TWO_FACTOR_COOKIE)
  }

  /**
   * `maxAge` is dropped rather than zeroed: Express writes `Expires` from it,
   * and a past date plus its own `Max-Age=0` is two ways of saying the same
   * thing that some proxies normalise differently.
   */
  private clear(response: Response, name: string): void {
    const { maxAge: _maxAge, ...options } = this.optionsFor(name)

    response.clearCookie(name, options)
  }
}

/** One place, so a new cookie cannot quietly inherit another's lifetime. */
function ttlSecondsFor(name: string): number {
  if (name === ACCESS_TOKEN_COOKIE) return ACCESS_TOKEN_TTL_SECONDS
  if (name === TWO_FACTOR_COOKIE) return TWO_FACTOR_CHALLENGE_TTL_SECONDS

  return REFRESH_TOKEN_TTL_SECONDS
}
