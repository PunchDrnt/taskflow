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
} from '../../app/(signed-in)/(org)/projects/[projectId]/settings/actions'
import { blankForm } from '../../lib/forms/form-state'
import { PaletteField } from '../molecules/palette-field'

/**
 * How a project is labelled everywhere in Taskflow.
 *
 * ⚠️ The key prefix carries a warning rather than a confirmation dialog. Every
 * key is assembled from it at read time, so changing it rewrites `OPS-14` into
 * `OP-14` in every list at once — but nothing is lost and nothing becomes
 * ambiguous, because `tasks.number` is what is stored and numbers are never
 * reissued. That is a thing to be told, not a thing to be stopped from doing.
 *
 * Saved on submit rather than per field. The statuses beside it save
 * immediately because each row there is its own object; a name, a prefix and a
 * colour are one description of one thing, and a half-applied rename is a
 * project nobody meant to have.
 */
export function ProjectGeneralForm({ project }: { project: ProjectRow }) {
  const [state, setState] = useState(blankForm<ProjectField>())
  const [saved, setSaved] = useState(false)
  const [prefix, setPrefix] = useState(project.keyPrefix)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    setSaved(false)
    startTransition(async () => {
      const result = await updateProject(project.id, formData)

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
              <FieldLabel htmlFor="project-key-prefix">Key prefix</FieldLabel>
              <Input
                id="project-key-prefix"
                name="keyPrefix"
                required
                maxLength={6}
                className="font-mono uppercase"
                value={prefix}
                aria-invalid={state.fieldErrors.keyPrefix !== undefined}
                onChange={(event) =>
                  setPrefix(event.target.value.toUpperCase())
                }
              />
              <FieldDescription>
                Every key is rewritten:{' '}
                <span className="font-mono">
                  {prefix === '' ? project.keyPrefix : prefix}-14
                </span>
                . Numbers are never reissued.
              </FieldDescription>
              {state.fieldErrors.keyPrefix !== undefined && (
                <FieldError
                  errors={[{ message: state.fieldErrors.keyPrefix }]}
                />
              )}
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
