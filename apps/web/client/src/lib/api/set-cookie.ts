/**
 * Turning the API's `Set-Cookie` headers into something `cookies().set()` can
 * take.
 *
 * `proxy.ts` does not need this — it can append the raw header to its response
 * and the browser gets the API's own bytes, attributes and all. A Server
 * Action can't: its only way to write a cookie is the structured
 * `cookies().set(name, value, options)`, so the header has to be taken apart
 * and put back together. Everything that gets dropped here is an attribute the
 * browser will no longer see, which is why the four that matter —
 * `path`, `httpOnly`, `secure`, `sameSite` — are handled by name rather than
 * by a generic loop that silently skips what it does not recognise.
 *
 * Losing `path` is the one that bites. Every cookie here is written at `/`
 * today, so a dropped `path` happens to land on the same value — which is
 * exactly the kind of accident that survives review and then breaks the day
 * one cookie is scoped differently: the copy and the original would coexist
 * under one name, the browser would pick by longest path, and a rotation would
 * appear not to have happened.
 */

/** Structurally what `cookies().set` accepts, and only what we actually set. */
export interface SetCookieOptions {
  path?: string
  domain?: string
  maxAge?: number
  expires?: Date
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
}

export interface ParsedSetCookie {
  name: string
  value: string
  options: SetCookieOptions
}

/**
 * One header. Returns null for anything that is not a cookie assignment, so a
 * malformed header is skipped rather than written as a cookie named `""`.
 *
 * Values are taken verbatim, not URL-decoded. Everything the API puts in a
 * cookie is `base64url` — the access token is a JWT, the refresh token is
 * `randomBytes(32).toString('base64url')`, the active org is a UUID — and none
 * of those alphabets contains a character `encodeURIComponent` touches. So the
 * bytes that arrive are the bytes to store, and adding a decode step would
 * only create the chance of a mismatched encode on the way back out.
 */
export function parseSetCookie(header: string): ParsedSetCookie | null {
  const [assignment, ...rest] = header.split(';')
  if (assignment === undefined) return null

  const separator = assignment.indexOf('=')
  if (separator < 1) return null

  const name = assignment.slice(0, separator).trim()
  const value = assignment.slice(separator + 1).trim()
  if (name === '') return null

  const options: SetCookieOptions = {}

  for (const attribute of rest) {
    const equals = attribute.indexOf('=')
    const key = (equals === -1 ? attribute : attribute.slice(0, equals))
      .trim()
      .toLowerCase()
    const raw = equals === -1 ? '' : attribute.slice(equals + 1).trim()

    switch (key) {
      case 'path':
        options.path = raw
        break
      case 'domain':
        options.domain = raw
        break
      case 'max-age': {
        const seconds = Number(raw)
        if (Number.isFinite(seconds)) options.maxAge = seconds
        break
      }
      case 'expires': {
        const at = new Date(raw)
        if (!Number.isNaN(at.getTime())) options.expires = at
        break
      }
      case 'httponly':
        options.httpOnly = true
        break
      case 'secure':
        options.secure = true
        break
      case 'samesite': {
        const mode = raw.toLowerCase()
        if (mode === 'lax' || mode === 'strict' || mode === 'none') {
          options.sameSite = mode
        }
        break
      }
      default:
        break
    }
  }

  return { name, value, options }
}

/**
 * Express writes both `Max-Age` and `Expires` from the same `maxAge`, and a
 * cleared cookie carries `Expires` in 1970 with no `Max-Age` at all. Both say
 * the same thing; keeping both is harmless and keeping neither is not, so this
 * exists only to make the intent legible at the call site.
 */
export function isExpired(cookie: ParsedSetCookie, now = Date.now()): boolean {
  if (cookie.options.maxAge !== undefined) return cookie.options.maxAge <= 0
  if (cookie.options.expires !== undefined) {
    return cookie.options.expires.getTime() <= now
  }

  return false
}
