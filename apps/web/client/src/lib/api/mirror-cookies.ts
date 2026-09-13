import { cookies } from 'next/headers'

import { parseSetCookie } from './set-cookie'

/**
 * Copies the API's `Set-Cookie` headers onto this action's response.
 *
 * Needed because `apiForAction` writes cookies only for a refresh it performed
 * itself. The pair minted by signing in, the clearing pair from signing out
 * and the `active_org` cookie from switching all arrive on *that* response, so
 * they are passed through by hand — and by one function rather than three
 * copies of it, since a cookie the browser never receives fails silently.
 */
export async function mirrorCookies(raw: unknown): Promise<void> {
  if (!Array.isArray(raw)) return

  const jar = await cookies()

  for (const header of raw) {
    if (typeof header !== 'string') continue

    const cookie = parseSetCookie(header)
    if (cookie !== null) jar.set(cookie.name, cookie.value, cookie.options)
  }
}
