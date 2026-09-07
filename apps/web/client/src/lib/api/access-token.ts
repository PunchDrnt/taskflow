/**
 * Reading `exp` off the access token **without verifying it**, which is the
 * only thing the web half is ever allowed to do with it.
 *
 * That looks alarming written down, so: the question here is not "is this
 * token genuine" — it is "is it worth sending". A forged token gets 401 from
 * the guard, which holds `JWT_SECRET` and is the only thing that decides. If
 * the proxy verified signatures too, the secret would have to live in the web
 * container as well, and the number of processes able to mint a session would
 * go from one to two for no gain at all.
 *
 * So the failure modes are both harmless: a forged `exp` far in the future
 * means we skip a refresh and the API answers 401, which the browser client
 * then refreshes on; a forged `exp` in the past means one wasted refresh.
 */

/**
 * True when the token is unreadable, has no usable `exp`, or expires within
 * `skewSeconds`.
 *
 * Unreadable counts as expired on purpose. The alternative is treating a
 * cookie we cannot parse as good and letting the render fail, and there is no
 * situation where sending a token we could not read is the better guess.
 */
export function accessTokenNeedsRefresh(
  token: string | undefined,
  skewSeconds: number,
  now = Date.now(),
): boolean {
  if (token === undefined || token === '') return true

  const expiresAt = expiryOf(token)
  if (expiresAt === null) return true

  return expiresAt - now <= skewSeconds * 1000
}

/** Milliseconds since the epoch, or null if the token does not say. */
export function expiryOf(token: string): number | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  try {
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString('utf8'),
    )

    if (typeof payload !== 'object' || payload === null) return null

    const { exp } = payload as { exp?: unknown }

    // `exp` is seconds in JWT and milliseconds everywhere in JavaScript, which
    // is a factor of a thousand and therefore a bug that looks like "the token
    // never expires" rather than like a bug.
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}
