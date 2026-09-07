import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { CookieOptions, Response } from 'express'

import type { Env } from '../../../config/env'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  type Tokens,
} from './token.service'

export const ACCESS_TOKEN_COOKIE = 'access_token'
export const REFRESH_TOKEN_COOKIE = 'refresh_token'
export const ACTIVE_ORG_COOKIE = 'active_org'

/**
 * Where the browser sends the refresh token, and nowhere else. This is the
 * path as *Caddy* sees it, not as Nest does: `handle_path /api/*` strips the
 * prefix before the request reaches `setGlobalPrefix('v1')`, so the browser's
 * URL is `/api/v1/auth/...` while the route is `/v1/auth/...`. Writing the
 * Nest path here would scope the cookie to a path that never appears in a URL,
 * and it would simply never be sent.
 */
const REFRESH_TOKEN_PATH = '/api/v1/auth'

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
 * - `path` — only the refresh token narrows it, so an access token leaking out
 *   of one endpoint does not carry the thing that mints new ones with it.
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
      path: name === REFRESH_TOKEN_COOKIE ? REFRESH_TOKEN_PATH : '/',
      maxAge:
        (name === ACCESS_TOKEN_COOKIE
          ? ACCESS_TOKEN_TTL_SECONDS
          : REFRESH_TOKEN_TTL_SECONDS) * 1000,
    }
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
