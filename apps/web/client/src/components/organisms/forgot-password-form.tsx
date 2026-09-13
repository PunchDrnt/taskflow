'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import { Button } from '@repo/ui/components/button'
import { Field, FieldError, FieldLabel } from '@repo/ui/components/field'
import { Input } from '@repo/ui/components/input'

import {
  requestPasswordReset,
  type ForgotField,
} from '../../app/forgot-password/actions'
import { blankForm } from '../../lib/forms/form-state'

/**
 * Asking for a reset link.
 *
 * 🔒 The confirmation is phrased as a **conditional** — "if an account
 * exists" — and it is not softened wording around a certainty: the API really
 * does answer the same way for an address it has never seen, so anything more
 * definite here would be the screen inventing knowledge it was not given.
 *
 * The form stays on screen after sending. The usual next move is "I typed it
 * wrong", and a page that replaced itself with a success message would make
 * that a back button and a retype.
 */
export function ForgotPasswordForm() {
  const [state, setState] = useState(blankForm<ForgotField>())
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '')

    setSentTo(null)
    startTransition(async () => {
      const result = await requestPasswordReset(formData)

      setState(result)

      if (
        result.error === null &&
        Object.keys(result.fieldErrors).length === 0
      ) {
        setSentTo(email)
      }
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {state.error !== null && (
        <p
          role="alert"
          className="border-error-main/30 bg-error-main/10 text-error-main body-2 rounded-md border px-3 py-2"
        >
          {state.error}
        </p>
      )}

      {sentTo !== null && (
        <p
          role="status"
          className="border-success-outlined-border bg-success-soft text-success-light body-2 rounded-md border px-3 py-2.5"
        >
          If an account exists for {sentTo}, a reset link is on its way. The
          link works once and expires in 30 minutes.
        </p>
      )}

      <Field>
        <FieldLabel htmlFor="forgot-email">Email</FieldLabel>
        <Input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          aria-invalid={state.fieldErrors.email !== undefined}
        />
        {state.fieldErrors.email !== undefined && (
          <FieldError errors={[{ message: state.fieldErrors.email }]} />
        )}
      </Field>

      <Button type="submit" color="primary" disabled={pending}>
        {pending ? 'Sending' : sentTo !== null ? 'Send again' : 'Send the link'}
      </Button>

      <Link
        href="/login"
        className="text-text-secondary body-2 hover:text-primary-light self-center"
      >
        Back to log in
      </Link>
    </form>
  )
}
