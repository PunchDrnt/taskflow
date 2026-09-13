'use server'

import {
  AUTH_ERROR_CODES,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@repo/shared'

import { toApiError } from '../../lib/api/errors'
import { apiForAction } from '../../lib/api/server'
import {
  failureOf,
  fieldErrorsOf,
  type FormState,
} from '../../lib/forms/form-state'

export type ForgotField = 'email'

/**
 * Asks for a reset link.
 *
 * 🔒 **Succeeds whether or not the address exists.** The API answers 204
 * either way — it has to, or this form becomes a way to ask "does this person
 * work here", which for a company directory is most of what an attacker wants.
 * So the screen says "if an account exists" rather than "sent", and this
 * action has no branch for "no such user" because it is never told.
 *
 * A network failure is still reported: that is about the request, not about
 * whether the address is real.
 */
export async function requestPasswordReset(
  formData: FormData,
): Promise<FormState<ForgotField>> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get('email'),
  })

  if (!parsed.success) {
    return {
      error: null,
      fieldErrors: fieldErrorsOf(parsed.error.issues, ['email']),
    }
  }

  try {
    const api = await apiForAction()
    await api.post('/auth/forgot-password', parsed.data)
  } catch (error) {
    return { error: toApiError(error).message, fieldErrors: {} }
  }

  return { error: null, fieldErrors: {} }
}

export type ResetField = 'code' | 'newPassword' | 'confirmNewPassword'

/**
 * Spends the emailed code and sets the new password.
 *
 * `INVALID_RESET_CODE` covers wrong, expired and already-used with one code on
 * purpose, so a guessed link cannot be told from a stale one. It is blamed on
 * `code` rather than shown above the form: the field is hidden, so the message
 * would have nowhere to land — which is why the page renders it as the
 * top-level error instead and offers the way back to asking for a fresh link.
 */
export async function resetPassword(
  formData: FormData,
): Promise<FormState<ResetField>> {
  const parsed = resetPasswordSchema.safeParse({
    code: formData.get('code'),
    newPassword: formData.get('newPassword'),
    confirmNewPassword: formData.get('confirmNewPassword'),
  })

  if (!parsed.success) {
    return {
      error: null,
      fieldErrors: fieldErrorsOf(parsed.error.issues, [
        'code',
        'newPassword',
        'confirmNewPassword',
      ]),
    }
  }

  try {
    const api = await apiForAction()
    await api.post('/auth/reset-password', parsed.data)
  } catch (error) {
    return failureOf<ResetField>(error, {
      [AUTH_ERROR_CODES.INVALID_RESET_CODE]: 'code',
    })
  }

  return { error: null, fieldErrors: {} }
}
