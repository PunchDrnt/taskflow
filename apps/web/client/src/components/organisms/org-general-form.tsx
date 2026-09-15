'use client'

import { useState, useTransition } from 'react'

import type { OrganizationRow } from '@repo/shared'
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
  renameOrganization,
  type OrgField,
} from '@/app/(signed-in)/(org)/settings/organization/actions'
import { blankForm } from '@/lib/forms/form-state'

/**
 * What the organisation is called, and the one fact about it that is not a
 * setting yet.
 *
 * 🔒 **Owner only.** `ability.ts` gives an admin `manage all` and then takes
 * back exactly two things, and `update Organization` is one of them — so an
 * admin reading this screen is shown the name rather than a box that would be
 * refused. The design's own permission table disagrees and puts a tick under
 * Admin here; the code is what ships, and the Roles tab states the code.
 *
 * The slug is shown and not offered, for the reason `ProjectGeneralForm`
 * shows the key prefix as text: a control nobody may use invites a click and
 * then refuses it. No route reads it today, so changing it would alter a
 * string nobody sees while creating a link to break later.
 *
 * The design's time zone row is gone. It was true — `APP_TIME_ZONE` pins every
 * date this app renders to `Asia/Bangkok`, viewer's clock ignored — but a row
 * stating a constant is a row that reads as a setting and answers a question
 * nobody in one country asks. The pinning is explained where it is decided, in
 * `lib/format/due-date.ts`; this screen is for things somebody can change.
 *
 * The design's logo upload, week-start and per-organisation project defaults
 * are absent too: nothing stores any of them. A switch that forgets is worse
 * than a setting that is not offered yet.
 */
export function OrgGeneralForm({
  organization,
  editable,
}: {
  organization: OrganizationRow
  /** False for an admin or a member, who may read this and not change it. */
  editable: boolean
}) {
  const [state, setState] = useState(blankForm<OrgField>())
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    setSaved(false)
    startTransition(async () => {
      const result = await renameOrganization(formData)

      setState(result)
      setSaved(
        result.error === null && Object.keys(result.fieldErrors).length === 0,
      )
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {state.error !== null && (
        <p
          role="alert"
          className="border-error-main/30 bg-error-main/10 text-error-main body-2 rounded-md border px-3 py-2"
        >
          {state.error}
        </p>
      )}

      <div className="bg-paper-elevation-0 border-divider flex flex-col gap-6 rounded-lg border p-5">
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="org-name">Organisation name</FieldLabel>
              {editable ? (
                <Input
                  id="org-name"
                  name="name"
                  required
                  defaultValue={organization.name}
                  aria-invalid={state.fieldErrors.name !== undefined}
                />
              ) : (
                <p className="text-text-primary text-body-lg md:text-body-md flex h-8 items-center">
                  {organization.name}
                </p>
              )}
              {state.fieldErrors.name !== undefined && (
                <FieldError errors={[{ message: state.fieldErrors.name }]} />
              )}
            </Field>

            <Field>
              <FieldLabel>URL slug</FieldLabel>
              <p className="text-text-secondary text-body-lg md:text-body-md flex h-8 items-center font-mono">
                {organization.slug}
              </p>
              <FieldDescription>
                Set when the organisation was created. Nothing routes by it yet
                — which organisation you are in comes from the switcher.
              </FieldDescription>
            </Field>
          </div>
        </FieldGroup>
      </div>

      {editable && (
        <div className="flex items-center gap-3">
          <Button type="submit" color="primary" disabled={pending}>
            {pending ? 'Saving' : 'Save changes'}
          </Button>

          {saved && (
            <span className="text-success-main body-3" role="status">
              Saved
            </span>
          )}
        </div>
      )}

      {!editable && (
        <p className="text-text-disabled body-3">
          Only an owner can change these. Admins run the organisation&rsquo;s
          people; the organisation itself is the owners&rsquo;.
        </p>
      )}
    </form>
  )
}
