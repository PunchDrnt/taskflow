'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@repo/ui/components/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@repo/ui/components/field'
import { Input } from '@repo/ui/components/input'

import { signIn } from '../../app/login/actions'
import { SIGN_IN_START, type SignInState } from '../../app/login/sign-in-state'

/**
 * Sign in, in one form and two stages.
 *
 * The second factor is a stage of this form rather than a page of its own,
 * because the challenge lives in a cookie with a short life: a route change
 * between the password and the code is a chance to lose it to a refresh, a
 * back button, or a link opened in the meantime.
 *
 * `useActionState` and not a fetch — see `app/login/actions.ts` for why
 * signing in has to happen somewhere a cookie can be written.
 */
export function LoginForm() {
  const [state, formAction] = useActionState<SignInState, FormData>(
    signIn,
    SIGN_IN_START,
  )

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error !== null && (
        <p
          role="alert"
          className="border-error-main/30 bg-error-main/10 text-error-main rounded-md border px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      )}

      {state.stage === 'two-factor' ? (
        <TwoFactorFields error={state.fieldErrors.code} />
      ) : (
        <CredentialFields
          loginError={state.fieldErrors.login}
          passwordError={state.fieldErrors.password}
        />
      )}

      <Submit>{state.stage === 'two-factor' ? 'Verify' : 'Sign in'}</Submit>
    </form>
  )
}

function CredentialFields({
  loginError,
  passwordError,
}: {
  loginError?: string
  passwordError?: string
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="login">Email or username</FieldLabel>
        <Input
          id="login"
          name="login"
          autoComplete="username"
          autoFocus
          required
          aria-invalid={loginError !== undefined}
        />
        {loginError !== undefined && (
          <FieldError errors={[{ message: loginError }]} />
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={passwordError !== undefined}
        />
        {passwordError !== undefined && (
          <FieldError errors={[{ message: passwordError }]} />
        )}
      </Field>
    </FieldGroup>
  )
}

function TwoFactorFields({ error }: { error?: string }) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="code">Verification code</FieldLabel>
        <Input
          id="code"
          name="code"
          // `one-time-code` is what makes a phone offer the SMS or authenticator
          // code above the keyboard. `inputMode` stays text: a recovery code is
          // accepted in the same box and is not digits.
          autoComplete="one-time-code"
          autoFocus
          required
          aria-invalid={error !== undefined}
        />
        {error !== undefined && <FieldError errors={[{ message: error }]} />}
      </Field>
      <p className="text-text-secondary text-sm">
        Enter the six-digit code from your authenticator app, or one of your
        recovery codes.
      </p>
    </FieldGroup>
  )
}

/**
 * Its own component so `useFormStatus` can read the parent form's state —
 * the hook reports on the form above it, so a button that called it from
 * inside `LoginForm` would always report idle.
 */
function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Signing in…' : children}
    </Button>
  )
}
