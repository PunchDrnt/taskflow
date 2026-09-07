'use server'

import { cookies } from 'next/headers'

import { ACCESS_TOKEN_COOKIE, loginSchema } from '@repo/shared'

import { toApiError } from '../../lib/api/errors'
import { apiForAction } from '../../lib/api/server'
import { parseSetCookie } from '../../lib/api/set-cookie'

/**
 * The Server Action half of the harness.
 *
 * Every one of these goes through `apiForAction`, which is the surface that is
 * *allowed* to write cookies — the point being to prove that it does, and to
 * show what happens when the thing it needs in order to refresh is not in the
 * jar.
 */

export interface ActionOutcome {
  ok: boolean
  status: number
  code?: string
  label: string
  body?: unknown
  elapsedMs: number
}

/** Signs in and lets `apiForAction` mirror the API's cookies into the response. */
export async function loginAction(
  login: string,
  password: string,
): Promise<ActionOutcome> {
  const started = performance.now()

  const parsed = loginSchema.safeParse({ login, password, rememberMe: false })
  if (!parsed.success) {
    return {
      ok: false,
      status: 0,
      code: 'VALIDATION_FAILED',
      label: 'server action · login',
      body: parsed.error.issues,
      elapsedMs: performance.now() - started,
    }
  }

  return run('server action · login', started, async () => {
    const api = await apiForAction()
    const response = await api.post('/auth/login', parsed.data)

    // The cookies came back on this response and `apiForAction` has already
    // written them — but only because a Server Action is somewhere
    // `cookies().set()` works. The same two lines in a Server Component throw.
    await mirror(response.headers['set-cookie'])

    return response.data
  })
}

/** The read that has to survive an expired access token. */
export async function meAction(): Promise<ActionOutcome> {
  const started = performance.now()

  return run('server action · GET /me', started, async () => {
    const api = await apiForAction()

    return (await api.get('/me')).data
  })
}

/**
 * Six reads from **one** action, together.
 *
 * The case the single-request reasoning misses: `apiForAction` builds one
 * instance per action, and `Promise.all` puts several requests through it at
 * once. If the access token has aged out, every one of them comes back 401 and
 * every one of them wants to refresh.
 */
export async function meParallelAction(
  dropAccessTokenFirst = false,
): Promise<ActionOutcome> {
  const started = performance.now()

  return run('server action · GET /me ×6 พร้อมกัน', started, async () => {
    // The proxy runs on a Server Action's POST too — it goes to the page's own
    // URL, which the matcher covers — so by the time an action body runs, an
    // expired token has usually already been renewed. That makes `apiForAction`
    // the *second* line rather than the first, and this flag is how the second
    // line gets exercised at all: drop the cookie after the proxy has been and
    // gone.
    if (dropAccessTokenFirst) (await cookies()).delete(ACCESS_TOKEN_COOKIE)

    const api = await apiForAction()
    const replies = await Promise.all(
      Array.from({ length: 6 }, () => api.get<{ id: string }>('/me')),
    )

    return {
      requests: replies.length,
      distinctIds: new Set(replies.map((reply) => reply.data.id)).size,
    }
  })
}

export async function logoutAction(): Promise<ActionOutcome> {
  const started = performance.now()

  return run('server action · logout', started, async () => {
    const api = await apiForAction()
    const response = await api.post('/auth/logout')

    await mirror(response.headers['set-cookie'])

    return { signedOut: true }
  })
}

/**
 * Deletes the access token and leaves the refresh token alone — a signed-in
 * browser whose fifteen minutes are up, on demand.
 *
 * Not the same thing as an *expired* token, and the difference matters in one
 * place: `proxy.ts` decides by reading `exp`, and a cookie that is absent and
 * one that is stale take different branches to the same conclusion. The real
 * expiry is measured separately, by shortening the API's token lifetime.
 */
export async function dropAccessTokenAction(): Promise<ActionOutcome> {
  const jar = await cookies()

  jar.delete(ACCESS_TOKEN_COOKIE)

  return {
    ok: true,
    status: 200,
    label: 'server action · drop access_token',
    body: { dropped: ACCESS_TOKEN_COOKIE },
    elapsedMs: 0,
  }
}

/** What the browser is holding, as the server sees it. */
export async function cookieNamesAction(): Promise<string[]> {
  return (await cookies()).getAll().map((cookie) => cookie.name)
}

async function mirror(raw: unknown): Promise<void> {
  // `apiForAction` writes the cookies from a *refresh* it performs itself.
  // Cookies that arrive on an ordinary response — logging in, logging out —
  // are the caller's to write, which is this.
  const jar = await cookies()

  if (!Array.isArray(raw)) return

  for (const header of raw) {
    if (typeof header !== 'string') continue

    const cookie = parseSetCookie(header)
    if (cookie !== null) jar.set(cookie.name, cookie.value, cookie.options)
  }
}

async function run(
  label: string,
  started: number,
  work: () => Promise<unknown>,
): Promise<ActionOutcome> {
  try {
    const body = await work()

    return {
      ok: true,
      status: 200,
      label,
      body,
      elapsedMs: performance.now() - started,
    }
  } catch (error) {
    const failure = toApiError(error)

    return {
      ok: false,
      status: failure.status,
      code: failure.code,
      label,
      body: failure.message,
      elapsedMs: performance.now() - started,
    }
  }
}
