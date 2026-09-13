'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import { PASSWORD_MIN_LENGTH } from '@repo/shared'
import { Button, buttonVariants } from '@repo/ui/components/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@repo/ui/components/field'
import { Input } from '@repo/ui/components/input'

import {
  resetPassword,
  type ResetField,
} from '../../app/forgot-password/actions'
import { blankForm } from '../../lib/forms/form-state'

/**
 * Setting a new password from an emailed link.
 *
 * The code travels in a hidden input rather than being read from the URL at
 * submit time, so what is checked is what was in the link this page was opened
 * with — not whatever the address bar says by the time somebody presses the
 * button.
 *
 * A bad code is shown **above** the form: the field it belongs to is hidden,
 * so a message under it would be a message nobody sees, and the only useful
 * next step is asking for a fresh link rather than editing anything here.
 */
export function ResetPasswordForm({ code }: { code: string }) {
  const [state, setState] = useState(blankForm<ResetField>())
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await resetPassword(formData)

      setState(result)
      setDone(
        result.error === null && Object.keys(result.fieldErrors).length === 0,
      )
    })
  }

  if (done) {
    return (
      <div className="flex flex-col gap-5">
        <p
          role="status"
          className="border-success-outlined-border bg-success-soft text-success-light body-2 rounded-md border px-3 py-2.5"
        >
          Your password is set. Every session that was open has been signed out.
        </p>
        {/* A link wearing the button's clothes, not a `Button` rendering a
            link: Base UI's `Button` assumes a native <button> and would stamp
            `role="button"` over the anchor's own semantics. */}
        <Link href="/login" className={buttonVariants({ color: 'primary' })}>
          Back to log in
        </Link>
      </div>
    )
  }

  const linkProblem = state.error ?? state.fieldErrors.code

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <input type="hidden" name="code" value={code} />

      {linkProblem !== undefined && (
        <p
          role="alert"
          className="border-error-main/30 bg-error-main/10 text-error-main body-2 rounded-md border px-3 py-2"
        >
          {linkProblem}{' '}
          <Link href="/forgot-password" className="underline">
            Ask for a new link
          </Link>
          .
        </p>
      )}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="reset-password">New password</FieldLabel>
          <Input
            id="reset-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            autoFocus
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
          <FieldLabel htmlFor="reset-confirm">Confirm new password</FieldLabel>
          <Input
            id="reset-confirm"
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

      <Button type="submit" color="primary" disabled={pending}>
        {pending ? 'Saving' : 'Set new password'}
      </Button>
    </form>
  )
}
