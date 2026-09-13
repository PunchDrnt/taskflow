'use client'

import { useState, useTransition } from 'react'

import type { ProjectRow } from '@repo/shared'
import { Button } from '@repo/ui/components/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@repo/ui/components/field'
import { Input } from '@repo/ui/components/input'
import { Textarea } from '@repo/ui/components/textarea'

import {
  updateProject,
  type ProjectField,
} from '../../app/(signed-in)/(org)/projects/[projectKey]/settings/actions'
import { blankForm } from '../../lib/forms/form-state'
import { PaletteField } from '../molecules/palette-field'

/**
 * How a project is labelled everywhere in Taskflow.
 *
 * ⚠️ The key prefix is shown and not offered — text, not a disabled input,
 * because a control nobody may use is a control that invites a click and then
 * refuses it. It is the project's URL segment and the front half of every task
 * key, so changing it would 404 every link already pasted into chat, and open
 * a *different* project the day another one takes the freed prefix. Chosen at
 * create, where the dialog previews `DEV-14` under the box, and fixed after.
 *
 * Saved on submit rather than per field. The statuses beside it save
 * immediately because each row there is its own object; a name, a colour and a
 * description are one description of one thing, and a half-applied rename is a
 * project nobody meant to have.
 */
export function ProjectGeneralForm({ project }: { project: ProjectRow }) {
  const [state, setState] = useState(blankForm<ProjectField>())
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    setSaved(false)
    startTransition(async () => {
      const result = await updateProject(project.keyPrefix, formData)

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
          <div className="grid gap-4 sm:grid-cols-[minmax(0,20rem)_8rem]">
            <Field>
              <FieldLabel htmlFor="project-name">Project name</FieldLabel>
              <Input
                id="project-name"
                name="name"
                required
                defaultValue={project.name}
                aria-invalid={state.fieldErrors.name !== undefined}
              />
              {state.fieldErrors.name !== undefined && (
                <FieldError errors={[{ message: state.fieldErrors.name }]} />
              )}
            </Field>

            <Field>
              <FieldLabel>Key prefix</FieldLabel>
              {/* The input's own metrics — `h-8`, and the same responsive
                  body size — so the value sits on the baseline its neighbour
                  does and the row still reads as two fields. */}
              <p className="text-text-primary text-body-lg md:text-body-md flex h-8 items-center font-mono">
                {project.keyPrefix}
              </p>
              <FieldDescription>
                Every task is{' '}
                <span className="font-mono">{project.keyPrefix}-14</span>, and
                so is this project&rsquo;s link. Set when it was created.
              </FieldDescription>
            </Field>
          </div>

          <PaletteField name="color" defaultValue={project.color} />

          <Field>
            <FieldLabel htmlFor="project-description">
              Description <span className="text-text-disabled">optional</span>
            </FieldLabel>
            <Textarea
              id="project-description"
              name="description"
              className="max-w-160"
              rows={3}
              defaultValue={project.description ?? ''}
            />
            {state.fieldErrors.description !== undefined && (
              <FieldError
                errors={[{ message: state.fieldErrors.description }]}
              />
            )}
          </Field>
        </FieldGroup>
      </div>

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
    </form>
  )
}
