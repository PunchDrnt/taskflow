import { NextResponse, type NextRequest } from 'next/server'

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@repo/shared'

import { env } from './config/env'
import { accessTokenNeedsRefresh } from './lib/api/access-token'
import {
  ACCESS_TOKEN_REFRESH_SKEW_SECONDS,
  REFRESH_PATH,
  SERVER_API_PATH_PREFIX,
} from './lib/api/config'

/**
 * Renews the session **before** anything renders.
 *
 * `proxy.ts` is what Next 16 calls the file that used to be `middleware.ts`,
 * and the rename came with the thing that makes this approach work at all: a
 * proxy always runs on the Node.js runtime, and a route segment config that
 * says otherwise is a build error. No edge caveats, no fetch-only APIs.
 *
 * It is the only place on the server that can write a cookie *and* run before
 * a render. A Server Component cannot — `cookies().set()` throws there — and
 * that limitation is load-bearing rather than annoying: see the table in
 * `lib/api/server.ts` for what a render that refreshed anyway would do to the
 * account.
 *
 * ⚠️ **This only works because `refresh_token` is scoped to `/`.** It used to
 * be `path=/api/v1/auth`, and a path-scoped cookie is not attached to a page
 * request — so `request.cookies` held no refresh token here, this function
 * returned early every time, and renewing a session was something only
 * browser-side JavaScript could do. Narrowing that path again would not break
 * anything loudly; it would quietly turn this file back into a no-op and make
 * every cold load past fifteen minutes render signed-out. A unit test on
 * `auth.cookies.ts` pins the path for that reason.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value

  // Nothing to renew with: either signed out, or the refresh cookie's path
  // kept it away from this request. Both mean "carry on" — the render decides
  // what a signed-out visitor sees, which is a routing policy and not the
  // transport's business.
  if (refreshToken === undefined) return NextResponse.next()

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value

  // The common case, and the one that has to stay cheap: read a cookie,
  // base64-decode a JWT payload, compare a number. No network, no crypto, no
  // signature check — see `access-token.ts` for why verifying here would be
  // worse rather than safer.
  if (
    !accessTokenNeedsRefresh(accessToken, ACCESS_TOKEN_REFRESH_SKEW_SECONDS)
  ) {
    return NextResponse.next()
  }

  const refreshed = await refreshOnce(request, refreshToken)

  // A failed refresh already carries the API's clearing cookies. Let the
  // request through as a signed-out one rather than redirecting: which route
  // an expired session lands on is the app's decision, and baking `/login`
  // into the transport would make every app that reuses this file wrong.
  if (refreshed === null) return NextResponse.next()

  // Two writes, and both are necessary. The response's `Set-Cookie` updates
  // the browser for next time; the forwarded request headers update *this*
  // render, which has not happened yet and would otherwise use the token that
  // just expired.
  const forwarded = new Headers(request.headers)
  forwarded.set('cookie', cookieHeaderFrom(request, refreshed.cookies))

  const response = NextResponse.next({ request: { headers: forwarded } })

  // Appended raw, byte for byte. Re-serialising through `response.cookies.set`
  // would mean re-deriving `Path`, `Max-Age`, `SameSite` and `Secure` from a
  // parse — four chances to disagree with `auth.cookies.ts`, which is the one
  // place 🔒 says those live.
  for (const header of refreshed.setCookie) {
    response.headers.append('set-cookie', header)
  }

  return response
}

/** Long enough for a slow container, short enough to stay inside the grace. */
const REFRESH_TIMEOUT_MS = 5_000

interface Refreshed {
  /** Raw `Set-Cookie` headers, exactly as the API wrote them. */
  setCookie: string[]
  /** name → value, for rebuilding the header this render will send. */
  cookies: Map<string, string>
}

/**
 * 🔒 One renewal per token, however many requests arrive holding it.
 *
 * A cold load is not one request. The document, the prefetches Next fires for
 * every `<Link>` in view, and any RSC fetch a navigation starts all pass
 * through here, and if the token aged out while the tab was idle they arrive
 * together holding the same expired one. Each would otherwise refresh, and
 * they would race: one rotation wins and the rest match nothing, so the API
 * answers `SESSION_EXPIRED` — measured at six-for-six on the Server Action
 * path, which has exactly the same shape.
 *
 * Keyed by the token being spent rather than by the user, because that is what
 * makes two callers' work identical. Module-level, so it spans requests, which
 * is the whole point — and bounded, since an entry lives only as long as the
 * request it represents.
 */
const inFlight = new Map<string, Promise<Refreshed | null>>()

/**
 * How long a *successful* result stays in the map after it resolves.
 *
 * Dropping it the moment it settles is not enough. Eight parallel page
 * requests produced **two** refreshes rather than one: the ones that arrived
 * after the first had finished found nothing to join and opened a second
 * round, still holding the token the first had already spent. That succeeded
 * only because `AuthService`'s ten-second grace window replays a completed
 * rotation — which means the correctness of a burst rested on a *server-side*
 * safety net for late tabs, and a refresh slow enough to push the second round
 * past that window would have read as a stolen token and revoked the session.
 *
 * Comfortably inside that window, and only for results worth reusing: a
 * failure is dropped at once, so a blip does not lock renewal out for seconds.
 */
const REFRESH_RESULT_TTL_MS = 5_000

function refreshOnce(
  request: NextRequest,
  refreshToken: string,
): Promise<Refreshed | null> {
  const existing = inFlight.get(refreshToken)
  if (existing !== undefined) return existing

  const started = refresh(request)
  inFlight.set(refreshToken, started)

  void started.then(
    (result) => {
      if (result === null) {
        inFlight.delete(refreshToken)

        return
      }

      // `unref` so a pending entry never holds the process open on shutdown.
      setTimeout(
        () => inFlight.delete(refreshToken),
        REFRESH_RESULT_TTL_MS,
      ).unref?.()
    },
    // `refresh` answers null rather than throwing; this is belt and braces so
    // an entry can never outlive the work it stands for.
    () => inFlight.delete(refreshToken),
  )

  return started
}

async function refresh(request: NextRequest): Promise<Refreshed | null> {
  const url = `${env.apiInternalUrl}${SERVER_API_PATH_PREFIX}${REFRESH_PATH}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        // Every cookie the browser sent, unedited. The API reads the refresh
        // token out of it and ignores the rest.
        cookie: request.headers.get('cookie') ?? '',
        // Without these the session row records this container rather than
        // the person — same reasoning as `forwardedOriginHeaders` in
        // `lib/api/server.ts`.
        'user-agent': request.headers.get('user-agent') ?? 'unknown',
        ...forwardedFor(request),
      },
      // A renewal must never be served from a cache, by us or by anything
      // between us and the API.
      cache: 'no-store',
      // A hung refresh would otherwise hold the render open indefinitely, and
      // — worse — leave this request presenting a token long enough for a
      // later attempt to fall outside the API's reuse grace window. Well under
      // that window, and the `catch` below turns it into "carry on with what
      // we have" rather than a signed-out page.
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    })

    if (!response.ok) return null

    // `getSetCookie()` and not `get('set-cookie')`: several cookies come back
    // and the joined form cannot be split safely, because `Expires=Wed, 01
    // Jan 1970 ...` contains the separator.
    const setCookie = response.headers.getSetCookie()
    if (setCookie.length === 0) return null

    return { setCookie, cookies: valuesOf(setCookie) }
  } catch {
    // The API being unreachable is not an expired session. Returning null
    // lets the render proceed with the token it has, which will 401 and say
    // so, rather than signing everybody out because a container restarted.
    return null
  }
}

function forwardedFor(request: NextRequest): Record<string, string> {
  const value = request.headers.get('x-forwarded-for')

  return value === null ? {} : { 'x-forwarded-for': value }
}

/** The name/value pairs out of a set of `Set-Cookie` headers. */
function valuesOf(setCookie: string[]): Map<string, string> {
  const values = new Map<string, string>()

  for (const header of setCookie) {
    const assignment = header.split(';')[0] ?? ''
    const separator = assignment.indexOf('=')
    if (separator < 1) continue

    values.set(
      assignment.slice(0, separator).trim(),
      assignment.slice(separator + 1).trim(),
    )
  }

  return values
}

/** This request's cookies, with the renewed ones replacing their old values. */
function cookieHeaderFrom(
  request: NextRequest,
  updates: Map<string, string>,
): string {
  const merged = new Map(
    request.cookies.getAll().map((cookie) => [cookie.name, cookie.value]),
  )

  for (const [name, value] of updates) {
    if (value === '') merged.delete(name)
    else merged.set(name, value)
  }

  return [...merged].map(([name, value]) => `${name}=${value}`).join('; ')
}

/**
 * What the proxy runs on, and — more to the point — what it does not.
 *
 * `/api/*` is excluded because it belongs to the API (Caddy's `handle_path`
 * takes it before Next sees it in production, and the dev rewrite does the
 * same locally); the browser's own axios interceptor handles a 401 there.
 * `_next/*` and anything with a file extension are static assets, and running
 * a cookie check on each one would be the actual cost people mean when they
 * say middleware is slow.
 */
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|monitoring|.*\\..*).*)'],
}
