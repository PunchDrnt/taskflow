'use client'

import { useRef, useState, useTransition } from 'react'

import { PASSWORD_MIN_LENGTH } from '@repo/shared'
import { Button } from '@repo/ui/components/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@repo/ui/components/field'
import { Input } from '@repo/ui/components/input'

import {
  changePassword,
  type PasswordField,
} from '@/app/(signed-in)/(org)/settings/profile/actions'
import { blankForm } from '@/lib/forms/form-state'

/**
 * Changing your own password.
 *
 * Its own form rather than three more fields on the profile, because it
 * submits somewhere else and succeeds differently: `PATCH /v1/me/password`
 * revokes every *other* session, and a "Saved" that quietly signed four
 * devices out would be the most surprising thing this screen does. It says so
 * instead, with the number.
 *
 * The current password is required by the API and is the point of the screen —
 * a session left open on a borrowed laptop must not be enough to take the
 * account over.
 *
 * The form is reset through the DOM after a success rather than by holding
 * three controlled values: nothing on this screen reads what was typed, and a
 * password in React state is a password in a memory dump.
 */
export function PasswordForm() {
  const form = useRef<HTMLFormElement>(null)
  const [state, setState] = useState(blankForm<PasswordField>())
  const [done, setDone] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    setDone(null)
    startTransition(async () => {
      const result = await changePassword(formData)

      setState({ error: result.error, fieldErrors: result.fieldErrors })

      if (
        result.error === null &&
        Object.keys(result.fieldErrors).length === 0
      ) {
        setDone(result.signedOutSessions)
        form.current?.reset()
      }
    })
  }

  return (
    <form ref={form} onSubmit={submit} className="flex flex-col gap-4">
      {state.error !== null && (
        <p
          role="alert"
          className="border-error-main/30 bg-error-main/10 text-error-main body-2 rounded-md border px-3 py-2"
        >
          {state.error}
        </p>
      )}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="current-password">Current password</FieldLabel>
          <Input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={state.fieldErrors.currentPassword !== undefined}
          />
          {state.fieldErrors.currentPassword !== undefined && (
            <FieldError
              errors={[{ message: state.fieldErrors.currentPassword }]}
            />
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="new-password">New password</FieldLabel>
          <Input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            aria-invalid={state.fieldErrors.newPassword !== undefined}
          />
          <FieldDescription>
            At least {PASSWORD_MIN_LENGTH} characters.
          </FieldDescription>
          {state.fieldErrors.newPassword !== undefined && (
            <FieldError errors={[{ message: state.fieldErrors.newPassword }]} />
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="confirm-new-password">
            Confirm new password
          </FieldLabel>
          <Input
            id="confirm-new-password"
            name="confirmNewPassword"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={state.fieldErrors.confirmNewPassword !== undefined}
          />
          {state.fieldErrors.confirmNewPassword !== undefined && (
            <FieldError
              errors={[{ message: state.fieldErrors.confirmNewPassword }]}
            />
          )}
        </Field>
      </FieldGroup>

      <div className="flex items-center gap-3">
        <Button type="submit" color="primary" disabled={pending}>
          {pending ? 'Changing' : 'Change password'}
        </Button>

        {done !== null && (
          <span className="text-success-main body-3" role="status">
            {done === 0
              ? 'Password changed. No other devices were signed in.'
              : `Password changed, and ${done} other ${
                  done === 1 ? 'session was' : 'sessions were'
                } signed out.`}
          </span>
        )}
      </div>
    </form>
  )
}
