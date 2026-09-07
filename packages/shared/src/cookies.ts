/**
 * The names of the cookies auth runs on, and nothing else about them.
 *
 * The **attributes** stay in `auth.cookies.ts` in the API, which is the 🔒 "one
 * place cookie attributes exist" rule and is not what this file is. The names
 * are here because both sides read them and neither owns them: the API writes
 * these cookies, and the web app's proxy has to recognise `access_token` to
 * know whether it needs refreshing before a render.
 *
 * A name that drifts between the two fails **silently** — the proxy simply
 * never finds a token to check, so it never refreshes, and everyone is signed
 * out every fifteen minutes with nothing in any log to say why.
 */

/** The 15-minute JWT. Sent on every request, so it is scoped to `/`. */
export const ACCESS_TOKEN_COOKIE = 'access_token'

/**
 * The 15-day opaque token. Scoped to the auth path, so it is *not* attached to
 * ordinary requests — anything reading it server-side has to say so explicitly.
 */
export const REFRESH_TOKEN_COOKIE = 'refresh_token'

/** Which org this session is acting for. A choice, never a permission. */
export const ACTIVE_ORG_COOKIE = 'active_org'

/** Carries a half-finished login between the password step and the code step. */
export const TWO_FACTOR_COOKIE = 'two_factor_challenge'
