'use client'

import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'

import { BROWSER_API_BASE_PATH, isAuthEndpoint, REFRESH_PATH } from './config'
import { ApiError, toApiError } from './errors'

/**
 * The API as the **browser** sees it: same-origin, cookies attached by the
 * browser itself, and a 401 that quietly turns into a refresh and a retry.
 *
 * There is no token in JavaScript anywhere in this file, and there cannot be —
 * all three cookies are `httpOnly`. That is why this is an interceptor that
 * reacts to 401 rather than a scheduler that watches an expiry: the browser
 * half is not allowed to know when the token expires. `proxy.ts` is, because
 * it runs on the server and can read the cookie.
 */

/**
 * No interceptor, deliberately. Refreshing through `api` would recurse: the
 * refresh 401s, the interceptor refreshes, that 401s, and so on until the
 * stack ends.
 */
const bare: AxiosInstance = axios.create({
  baseURL: BROWSER_API_BASE_PATH,
  withCredentials: true,
})

/** What the app calls. Everything below configures this one object. */
export const api: AxiosInstance = axios.create({
  baseURL: BROWSER_API_BASE_PATH,
  // A no-op while every request is same-origin, which is the design and is
  // meant to stay that way. Kept because it is the line that says out loud
  // that cookies are the credential here.
  withCredentials: true,
})

interface RetriedConfig extends InternalAxiosRequestConfig {
  /**
   * Set before the retry, so a request whose refresh succeeded but which then
   * 401s again — the account was deactivated, the session was revoked — stops
   * instead of refreshing forever.
   */
  retriedAfterRefresh?: boolean
  /**
   * `refreshCount` as it stood when this request went out. Compared against
   * the count at the time its 401 comes back — see `refreshSession`.
   */
  sentAtRefreshCount?: number
}

/**
 * 🔒 One refresh per expiry, however many requests run into it.
 *
 * A shared in-flight promise is the obvious half of this and is not enough on
 * its own. **Measured, six parallel requests against an expired token produced
 * two refreshes**, because the six 401s do not arrive together: the first three
 * joined the refresh, it finished, `inFlightRefresh` went back to null, and the
 * last three — which had been sent before any of it happened — opened a second
 * round. Nothing breaks (the second rotation spends the token the first one
 * issued, which is an ordinary rotation and not a reuse) but half the refreshes
 * are waste, and the pattern gets worse the more requests a screen fires.
 *
 * So the question a 401 asks is not "is a refresh running" but **"has the token
 * changed since I was sent"**. A counter answers both: equal means this request
 * met the expiry first and must refresh; greater means somebody already did,
 * and there is nothing to do but try again.
 */
let inFlightRefresh: Promise<void> | null = null
let refreshCount = 0

export function refreshSession(): Promise<void> {
  inFlightRefresh ??= bare
    .post(REFRESH_PATH)
    .then(() => {
      refreshCount += 1
    })
    .finally(() => {
      inFlightRefresh = null
    })

  return inFlightRefresh
}

// Stamped on the way out, read on the way back. A request interceptor rather
// than the response one, because by the time a 401 arrives the counter may
// already have moved and there would be nothing left to compare against.
api.interceptors.request.use((config) => {
  ;(config as RetriedConfig).sentAtRefreshCount = refreshCount

  return config
})

/**
 * What to do when the refresh itself fails: the session is genuinely over and
 * the API has already cleared the cookies.
 *
 * A hard navigation rather than a router push, because everything cached —
 * the RSC payload, the router cache, any client state holding the last user —
 * belongs to a session that no longer exists.
 */
let sessionLostHandler = (): void => {
  window.location.assign('/login')
}

/** For screens that would rather show the failure than navigate away. */
export function setSessionLostHandler(handler: () => void): void {
  sessionLostHandler = handler
}

api.interceptors.response.use(undefined, async (error: unknown) => {
  const failure = toApiError(error)
  const config = configOf(error)

  if (
    failure.status !== 401 ||
    config === undefined ||
    config.retriedAfterRefresh === true ||
    isAuthEndpoint(config.url)
  ) {
    throw failure
  }

  config.retriedAfterRefresh = true

  // Somebody else refreshed while this request was in flight. Its 401 is stale
  // news, and refreshing again would spend a token that is already current.
  if (
    config.sentAtRefreshCount !== undefined &&
    config.sentAtRefreshCount < refreshCount
  ) {
    return api.request(config)
  }

  try {
    await refreshSession()
  } catch {
    sessionLostHandler()
    // The original 401, not the refresh's. The caller asked for `/me`, and
    // "your session ended" is the answer to that question; the refresh is an
    // implementation detail of this file.
    throw failure
  }

  return api.request(config)
})

function configOf(error: unknown): RetriedConfig | undefined {
  return axios.isAxiosError(error)
    ? (error.config as RetriedConfig | undefined)
    : undefined
}

export { ApiError }
