/**
 * The handful of constants both halves of the client agree on. Isomorphic on
 * purpose — no `next/headers`, no `window` — so the browser client, the server
 * client and `proxy.ts` can all read it without pulling one runtime's
 * machinery into another's bundle.
 */

/**
 * What the **browser** talks to: this origin, always.
 *
 * `/api/*` reaches the API through Caddy in production and through the dev
 * rewrite in `next.config.ts` locally. Never an absolute URL — the moment this
 * points somewhere else the requests become cross-origin, `SameSite=Lax` stops
 * sending the cookies, and CORS becomes necessary. docs/01-architecture.md#csrf
 * is explicit that this must not happen.
 */
export const BROWSER_API_BASE_PATH = '/api/v1'

/**
 * What the **server** talks to: the API directly, with no `/api` in front,
 * because there is no Caddy in the middle to strip it. `setGlobalPrefix('v1')`
 * is the whole prefix from this side.
 */
export const SERVER_API_PATH_PREFIX = '/v1'

/** Relative to whichever base above. One string, so the two cannot drift. */
export const REFRESH_PATH = '/auth/refresh'

/**
 * Endpoints where a 401 means "those credentials are wrong", not "your access
 * token aged out" — so refreshing and retrying would be nonsense at best and
 * an infinite loop at worst. Everything under `/auth/` qualifies: login, the
 * second factor, refresh itself, logout.
 */
export function isAuthEndpoint(url: string | undefined): boolean {
  return url !== undefined && url.startsWith('/auth/')
}

/**
 * How early to treat an access token as expired.
 *
 * Not zero. A token with four seconds left passes the check in the proxy, and
 * then the render it was let through for takes longer than four seconds — so
 * the request the proxy exists to protect 401s anyway. Thirty seconds costs
 * one extra refresh per fifteen-minute token and removes the whole class.
 */
export const ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 30
