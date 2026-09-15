'use client'

import { useRef, useState, useTransition } from 'react'

import type { Me } from '@repo/shared'
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
  saveProfile,
  type ProfileField,
} from '@/app/(signed-in)/(org)/settings/profile/actions'
import { blankForm } from '@/lib/forms/form-state'

import { AvatarField } from './avatar-field'

/**
 * Your own profile.
 *
 * **The nickname is required, like the real name.** CLAUDE.md's glossary is
 * explicit that Thai colleagues go by it and that the assignee picker searches
 * on it — a directory where it is optional is one where half the entries
 * cannot be found by what people actually call each other. It sits beside the
 * full name rather than under it because the two are read as a pair.
 *
 * ⏳ The email is shown and not editable. Changing it means proving the new
 * address first, and that flow is Phase 2; a box that silently refused to save
 * would be worse than a disabled one that says why.
 */
export function ProfileForm({ me }: { me: Me }) {
  const form = useRef<HTMLFormElement>(null)
  const [state, setState] = useState(blankForm<ProfileField>())
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  // Bumped by Cancel to remount `AvatarField`. A `form.reset()` puts the text
  // boxes back but cannot reach a picture that was uploaded and not yet saved,
  // and a Cancel that undoes four fields out of five is worse than none.
  const [generation, setGeneration] = useState(0)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    setSaved(false)
    startTransition(async () => {
      const result = await saveProfile(formData)

      setState(result)
      setSaved(
        result.error === null && Object.keys(result.fieldErrors).length === 0,
      )
    })
  }

  return (
    <form ref={form} onSubmit={submit} className="flex flex-col gap-6">
      {state.error !== null && (
        <p
          role="alert"
          className="border-error-main/30 bg-error-main/10 text-error-main body-2 rounded-md border px-3 py-2"
        >
          {state.error}
        </p>
      )}

      <div className="bg-paper-elevation-0 border-divider rounded-lg border p-4">
        <AvatarField
          key={generation}
          userId={me.id}
          storedValue={me.avatarUrl}
          fallback={[...me.nickname][0]?.toUpperCase() ?? '?'}
        />
      </div>

      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="profile-name">Full name</FieldLabel>
            <Input
              id="profile-name"
              name="name"
              required
              defaultValue={me.name}
              aria-invalid={state.fieldErrors.name !== undefined}
            />
            {state.fieldErrors.name !== undefined && (
              <FieldError errors={[{ message: state.fieldErrors.name }]} />
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="profile-nickname">Nickname</FieldLabel>
            <Input
              id="profile-nickname"
              name="nickname"
              required
              defaultValue={me.nickname}
              aria-invalid={state.fieldErrors.nickname !== undefined}
            />
            <FieldDescription>
              Shown first everywhere, and searchable in the assignee picker.
            </FieldDescription>
            {state.fieldErrors.nickname !== undefined && (
              <FieldError errors={[{ message: state.fieldErrors.nickname }]} />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="profile-username">Username</FieldLabel>
            <Input
              id="profile-username"
              name="username"
              required
              defaultValue={me.username}
              aria-invalid={state.fieldErrors.username !== undefined}
            />
            <FieldDescription>
              Appears in links and @-mentions. Lowercase letters, digits and
              underscores.
            </FieldDescription>
            {state.fieldErrors.username !== undefined && (
              <FieldError errors={[{ message: state.fieldErrors.username }]} />
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="profile-phone">
              Phone <span className="text-text-disabled">optional</span>
            </FieldLabel>
            <Input
              id="profile-phone"
              name="phone"
              type="tel"
              defaultValue={me.phone ?? ''}
              aria-invalid={state.fieldErrors.phone !== undefined}
            />
            {state.fieldErrors.phone !== undefined && (
              <FieldError errors={[{ message: state.fieldErrors.phone }]} />
            )}
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="profile-email">Email</FieldLabel>
          <Input id="profile-email" value={me.email} disabled readOnly />
          <FieldDescription>
            Changing this needs the new address confirmed first, which is not
            built yet.
          </FieldDescription>
        </Field>
      </FieldGroup>

      <div className="flex items-center gap-3">
        <Button type="submit" color="primary" disabled={pending}>
          {pending ? 'Saving' : 'Save changes'}
        </Button>

        <Button
          type="button"
          variant="ghost"
          color="neutral"
          disabled={pending}
          onClick={() => {
            form.current?.reset()
            setState(blankForm<ProfileField>())
            setSaved(false)
            setGeneration((one) => one + 1)
          }}
        >
          Cancel
        </Button>

        {saved && (
          <span className="text-success-main body-3" role="status">
            Saved
          </span>
        )}
      </div>
    </form>
  )
}
