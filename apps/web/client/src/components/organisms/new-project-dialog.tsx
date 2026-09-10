'use client'

import { Plus } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Button } from '@repo/ui/components/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/dialog'
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
  createProject,
  type NewProjectField,
} from '../../app/(signed-in)/projects/actions'
import { blankForm } from '../../lib/forms/form-state'
import { PaletteField } from '../molecules/palette-field'

/**
 * Making a project: a name, a key prefix, a colour, and nothing else required.
 *
 * A dialog rather than a page, because the list behind it is the context —
 * "what already exists" is most of what stops somebody creating a second
 * project for the same thing.
 *
 * The key prefix is compulsory (docs/04-features/phase-1.md#task-key) and it
 * is the field people will not understand from its label, so it gets a
 * suggestion and an explanation of what it becomes. Prefixes may repeat inside
 * one organisation on purpose: people type these, every list shows the project
 * name beside the number, and refusing a duplicate would send somebody hunting
 * for a spare three-letter word.
 */
export function NewProjectDialog() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState(blankForm<NewProjectField>())
  const [pending, startTransition] = useTransition()

  /**
   * Submitted by hand rather than through `useActionState`, because the dialog
   * has to close on success and only on success.
   *
   * `useActionState` would leave the result to be noticed in an effect, and
   * closing from an effect is a `setState` cascade the linter rejects on
   * principle — rightly: the close is a *consequence of the result*, not a
   * reaction to a state change, and expressing it here means a `NAME_TAKEN`
   * leaves the dialog open with everything still typed in it.
   */
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await createProject(state, formData)

      if (
        result.error === null &&
        Object.keys(result.fieldErrors).length === 0
      ) {
        setState(blankForm<NewProjectField>())
        setOpen(false)

        return
      }

      setState(result)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setState(blankForm<NewProjectField>())
        setOpen(next)
      }}
    >
      <DialogTrigger
        render={
          <Button color="primary">
            <Plus />
            New project
          </Button>
        }
      />

      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              It starts with four statuses — To do, In progress, Done and
              Cancelled — and you can change them afterwards.
            </DialogDescription>
          </DialogHeader>

          {state.error !== null && (
            <p
              role="alert"
              className="border-error-main/30 bg-error-main/10 text-error-main body-2 mt-4 rounded-md border px-3 py-2"
            >
              {state.error}
            </p>
          )}

          <FieldGroup className="my-4">
            <NameAndPrefix
              nameError={state.fieldErrors.name}
              prefixError={state.fieldErrors.keyPrefix}
            />

            <PaletteField name="color" />

            <Field>
              <FieldLabel htmlFor="project-description">
                Description <span className="text-text-disabled">optional</span>
              </FieldLabel>
              <Textarea id="project-description" name="description" rows={3} />
              {state.fieldErrors.description !== undefined && (
                <FieldError
                  errors={[{ message: state.fieldErrors.description }]}
                />
              )}
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="ghost" color="primary" />}>
              Cancel
            </DialogClose>
            <Submit pending={pending} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The name and the prefix together, because one suggests the other.
 *
 * The suggestion stops the moment somebody edits the prefix themselves —
 * overwriting a deliberate `OPS` with `OPE` as they finish typing "Operations"
 * is worse than not helping at all. It is only ever a default; the field is a
 * real input and the server validates it either way.
 */
function NameAndPrefix({
  nameError,
  prefixError,
}: {
  nameError?: string
  prefixError?: string
}) {
  const [prefix, setPrefix] = useState('')
  const [edited, setEdited] = useState(false)

  return (
    <>
      <Field>
        <FieldLabel htmlFor="project-name">Name</FieldLabel>
        <Input
          id="project-name"
          name="name"
          autoFocus
          required
          aria-invalid={nameError !== undefined}
          onChange={(event) => {
            if (!edited) setPrefix(suggestPrefix(event.target.value))
          }}
        />
        {nameError !== undefined && (
          <FieldError errors={[{ message: nameError }]} />
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="project-key-prefix">Key prefix</FieldLabel>
        <Input
          id="project-key-prefix"
          name="keyPrefix"
          required
          maxLength={6}
          className="w-32 uppercase"
          value={prefix}
          aria-invalid={prefixError !== undefined}
          onChange={(event) => {
            setEdited(true)
            setPrefix(event.target.value.toUpperCase())
          }}
        />
        <FieldDescription>
          Two to six characters, starting with a letter. Tasks are numbered{' '}
          <span className="font-mono">{prefix === '' ? 'DEV' : prefix}-1</span>,{' '}
          <span className="font-mono">{prefix === '' ? 'DEV' : prefix}-2</span>,
          and so on.
        </FieldDescription>
        {prefixError !== undefined && (
          <FieldError errors={[{ message: prefixError }]} />
        )}
      </Field>
    </>
  )
}

/**
 * A first guess at the prefix: the initials of the first words, or the start
 * of a single word. Latin letters and digits only — a Thai project name gives
 * nothing the CHECK would accept, and an empty box somebody has to fill is a
 * better answer than a suggestion that cannot be submitted.
 */
function suggestPrefix(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter((word) => word !== '')

  if (words.length === 0) return ''

  const candidate =
    words.length === 1 ? words[0]!.slice(0, 3) : words.map((w) => w[0]).join('')

  return candidate.slice(0, 6).toUpperCase()
}

function Submit({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" color="primary" disabled={pending}>
      {pending ? 'Creating' : 'Create project'}
    </Button>
  )
}
