'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import {
  AUTH_ERROR_CODES,
  loginSchema,
  twoFactorLoginSchema,
} from '@repo/shared'

import { toApiError } from '../../lib/api/errors'
import { apiForAction } from '../../lib/api/server'
import { parseSetCookie } from '../../lib/api/set-cookie'
import { SIGN_IN_START, type SignInState } from './sign-in-state'

/**
 * Signs in, or asks for the second factor.
 *
 * A Server Action rather than a browser `fetch`, because signing in is one of
 * the places a cookie must be *written* on the way back: `apiForAction` is the
 * surface allowed to do that, and `lib/api/server.ts` sets out at length what
 * a Server Component doing the same would cost.
 *
 * No redirect on success. Where somebody lands depends on how many
 * organisations they belong to, and `/` already decides that from `GET /me` —
 * so the form lets the route reload and the page decide, rather than two
 * places holding one rule.
 */
export async function signIn(
  previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const outcome =
    previous.stage === 'two-factor'
      ? await submitTwoFactor(formData)
      : await submitCredentials(formData)

  // Outside the `try` in `post`, and that placement is load-bearing: `redirect`
  // works by throwing, so calling it in there would be caught and reported as
  // a failed sign-in that had in fact succeeded.
  if (outcome === 'signed-in') redirect('/')

  return outcome
}

async function submitCredentials(
  formData: FormData,
): Promise<SignInState | 'signed-in'> {
  const parsed = loginSchema.safeParse({
    login: formData.get('login'),
    password: formData.get('password'),
    // No control on the form, so every session is a short one. `rememberMe`
    // is still the API's own field — it sets `sessions.expires_at` and nothing
    // downstream branches on it — so putting the choice back is a checkbox
    // here and nothing else.
    rememberMe: formData.get('rememberMe') === 'on',
  })

  if (!parsed.success) {
    return { ...SIGN_IN_START, fieldErrors: fieldErrorsOf(parsed.error.issues) }
  }

  return post('/auth/login', parsed.data, 'credentials')
}

async function submitTwoFactor(
  formData: FormData,
): Promise<SignInState | 'signed-in'> {
  const parsed = twoFactorLoginSchema.safeParse({ code: formData.get('code') })

  if (!parsed.success) {
    return {
      stage: 'two-factor',
      error: null,
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    }
  }

  return post('/auth/login/2fa', parsed.data, 'two-factor')
}

async function post(
  path: string,
  body: unknown,
  stage: SignInState['stage'],
): Promise<SignInState | 'signed-in'> {
  try {
    const api = await apiForAction()
    const response = await api.post(path, body)

    // `apiForAction` writes cookies only for a refresh it performed itself.
    // The pair minted by a successful sign-in arrives on *this* response, so
    // it is mirrored by hand — the two lines the harness exists to prove.
    await mirror(response.headers['set-cookie'])

    const data = response.data as { twoFactorRequired?: boolean }

    return data.twoFactorRequired === true
      ? { stage: 'two-factor', error: null, fieldErrors: {} }
      : 'signed-in'
  } catch (error) {
    const failure = toApiError(error)

    return {
      // A challenge that expired leaves nothing to answer, so the form goes
      // back to the start rather than showing a code box that cannot succeed.
      stage:
        failure.code === AUTH_ERROR_CODES.SESSION_EXPIRED
          ? 'credentials'
          : stage,
      error: failure.message,
      fieldErrors: {},
    }
  }
}

/** The first message per field; the form shows one line under each input. */
function fieldErrorsOf(
  issues: { path: PropertyKey[]; message: string }[],
): SignInState['fieldErrors'] {
  const errors: SignInState['fieldErrors'] = {}

  for (const issue of issues) {
    const field = String(issue.path[0] ?? '')

    if (
      (field === 'login' || field === 'password' || field === 'code') &&
      errors[field] === undefined
    ) {
      errors[field] = issue.message
    }
  }

  return errors
}

/** Copies the API's `Set-Cookie` headers onto this action's response. */
async function mirror(raw: unknown): Promise<void> {
  if (!Array.isArray(raw)) return

  const jar = await cookies()

  for (const header of raw) {
    if (typeof header !== 'string') continue

    const cookie = parseSetCookie(header)
    if (cookie !== null) jar.set(cookie.name, cookie.value, cookie.options)
  }
}
