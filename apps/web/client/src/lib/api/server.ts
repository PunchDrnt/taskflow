import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'
import { cookies, headers } from 'next/headers'

import { env } from '../../config/env'
import { isAuthEndpoint, REFRESH_PATH, SERVER_API_PATH_PREFIX } from './config'
import { toApiError } from './errors'
import { parseSetCookie, type ParsedSetCookie } from './set-cookie'

/**
 * The API as the **server** sees it, in the two shapes Next actually offers.
 *
 * They differ in one thing, and it is the thing that makes this file worth
 * reading: whether the caller is somewhere a cookie can be written.
 *
 * | | `cookies().set()` | so a 401 means |
 * | --- | --- | --- |
 * | Server Component, during render | throws | give up — `apiForRender` |
 * | Server Action / Route Handler | works | refresh and retry — `apiForAction` |
 * | `proxy.ts` | writes to the response | refresh before anything renders |
 *
 * ⚠️ **The middle row is not the dangerous one — the top row is.** A render
 * that refreshed on 401 would *succeed*: the API rotates the token and hands
 * back a new pair. It is only the write that fails, silently, so the browser
 * keeps the token that was just rotated away from. The next request presents
 * it, and past the ten-second grace window `AuthService.detectReuse` reads a
 * replaced token as a stolen one: the session is revoked, every device is
 * signed out, and an alert fires. A refresh in a render is not a refresh that
 * does not work; it is one that works and then breaks the account.
 *
 * That is why `apiForRender` cannot refresh, rather than merely does not — and
 * why `proxy.ts` exists to make the case rare.
 */

/** Shared by all three: base URL, timeout, and nothing that holds state. */
function createInstance(): AxiosInstance {
  return axios.create({
    baseURL: `${env.apiInternalUrl}${SERVER_API_PATH_PREFIX}`,
    timeout: 10_000,
    // Cookies are attached by hand here — there is no browser to do it, and
    // `withCredentials` means nothing outside one.
    withCredentials: false,
  })
}

/**
 * Every cookie this request arrived with, as one header.
 *
 * All of them, not a chosen few. Which cookies the browser attached depends on
 * the path it was asking for, and the server's job is to pass on whatever
 * actually arrived rather than to assume a set — a request that turns out not
 * to carry the refresh token should fail as a session that cannot be renewed,
 * not as a header assembled from a guess.
 */
async function currentCookieHeader(): Promise<string> {
  const jar = await cookies()

  return jar
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')
}

/**
 * The caller's user agent and address, forwarded.
 *
 * Without this, a login through a Server Action writes the *Next server* into
 * `iam.sessions.user_agent` and `ip_address` — every row reading
 * `axios/1.x` from the same container address, and the "your devices" screen
 * showing one entry per session that all look identical. Express resolves
 * `request.ip` from `x-forwarded-for` because `main.ts` sets
 * `trust proxy: 1`, so passing the header through is the whole fix.
 */
async function forwardedOriginHeaders(): Promise<Record<string, string>> {
  const incoming = await headers()
  const forwarded: Record<string, string> = {}

  const userAgent = incoming.get('user-agent')
  if (userAgent !== null) forwarded['user-agent'] = userAgent

  // Caddy sets this in production; in `yarn dev` there is no proxy and the
  // header is absent, which is correct rather than missing.
  const forwardedFor = incoming.get('x-forwarded-for')
  if (forwardedFor !== null) forwarded['x-forwarded-for'] = forwardedFor

  return forwarded
}

/**
 * For **Server Components**. Reads the session, never renews it.
 *
 * A 401 from here is a real signed-out state by the time it is thrown: either
 * `proxy.ts` already tried to refresh and failed, or the request never had a
 * session at all. Treat it as "render the signed-out view", not as something
 * to recover from — see the docblock above for what recovering would cost.
 */
export async function apiForRender(): Promise<AxiosInstance> {
  const instance = createInstance()
  const cookieHeader = await currentCookieHeader()
  const origin = await forwardedOriginHeaders()

  instance.interceptors.request.use((config) => {
    config.headers.set({ ...origin, cookie: cookieHeader })

    return config
  })

  instance.interceptors.response.use(undefined, (error: unknown) => {
    throw toApiError(error)
  })

  return instance
}

/**
 * For **Server Actions and Route Handlers**. Refreshes on 401, writes the new
 * cookies, and retries once.
 *
 * The refresh is not single-flighted the way the browser client's is, and does
 * not need to be: one action is one request, and two actions running at once
 * are two independent server requests that could not share a promise anyway.
 * What covers them is the API's own ten-second grace window, which hands the
 * same new pair to both.
 */
export async function apiForAction(): Promise<AxiosInstance> {
  const instance = createInstance()
  const origin = await forwardedOriginHeaders()

  // Mutable, because a successful refresh changes it and the retry has to go
  // out with the new tokens rather than the ones that just 401'd.
  let cookieHeader = await currentCookieHeader()

  instance.interceptors.request.use((config) => {
    config.headers.set({ ...origin, cookie: cookieHeader })

    return config
  })

  instance.interceptors.response.use(undefined, async (error: unknown) => {
    const failure = toApiError(error)
    const config = axios.isAxiosError(error)
      ? (error.config as RetriedConfig | undefined)
      : undefined

    if (
      failure.status !== 401 ||
      config === undefined ||
      config.retriedAfterRefresh === true ||
      isAuthEndpoint(config.url)
    ) {
      throw failure
    }

    config.retriedAfterRefresh = true

    const refreshed = await refreshFromServer(cookieHeader, origin)
    if (refreshed === null) throw failure

    cookieHeader = refreshed
    return instance.request(config)
  })

  return instance
}

interface RetriedConfig extends InternalAxiosRequestConfig {
  retriedAfterRefresh?: boolean
}

/**
 * Spends the refresh token, writes what comes back into this response's
 * cookies, and returns the header the retry should use. Null means the session
 * is over — the API has already sent the clearing cookies, and those are
 * written too, so the browser stops presenting a token that will never work.
 *
 * The returned header is built from the parsed cookies rather than read back
 * out of `cookies()`. Both would work today; this one does not depend on
 * whether Next shows a pending write to a later read in the same action, which
 * is an implementation detail and not something the docs promise.
 */
async function refreshFromServer(
  cookieHeader: string,
  origin: Record<string, string>,
): Promise<string | null> {
  const jar = await cookies()
  const bare = createInstance()

  let received: ParsedSetCookie[]

  try {
    const response = await bare.post(REFRESH_PATH, null, {
      headers: { ...origin, cookie: cookieHeader },
    })
    received = parseAll(response.headers['set-cookie'])
  } catch (error) {
    // The 401 body carries clearing cookies of its own — the API drops the
    // session on a failed refresh precisely so the browser does not keep
    // presenting a dead token.
    received = axios.isAxiosError(error)
      ? parseAll(error.response?.headers['set-cookie'])
      : []

    for (const cookie of received) {
      jar.set(cookie.name, cookie.value, cookie.options)
    }

    return null
  }

  for (const cookie of received) {
    jar.set(cookie.name, cookie.value, cookie.options)
  }

  return mergeCookieHeader(cookieHeader, received)
}

function parseAll(raw: unknown): ParsedSetCookie[] {
  // Node's HTTP parser splits `Set-Cookie` into an array by itself, which is
  // the only correct way to do it: the header's own `Expires=Wed, 01 Jan ...`
  // contains the comma that a naive split would break on.
  if (!Array.isArray(raw)) return []

  return raw
    .filter((header): header is string => typeof header === 'string')
    .map(parseSetCookie)
    .filter((cookie): cookie is ParsedSetCookie => cookie !== null)
}

/** The request's cookies with the new ones overwriting the old by name. */
function mergeCookieHeader(
  existing: string,
  updates: ParsedSetCookie[],
): string {
  const merged = new Map<string, string>()

  for (const pair of existing.split(';')) {
    const separator = pair.indexOf('=')
    if (separator < 1) continue
    merged.set(
      pair.slice(0, separator).trim(),
      pair.slice(separator + 1).trim(),
    )
  }

  for (const cookie of updates) {
    // A cleared cookie comes back with an empty value; dropping it rather than
    // sending `name=` keeps the retry's header honest about what is held.
    if (cookie.value === '') merged.delete(cookie.name)
    else merged.set(cookie.name, cookie.value)
  }

  return [...merged].map(([name, value]) => `${name}=${value}`).join('; ')
}
