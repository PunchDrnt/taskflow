import { Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'

import { TASK_PRIORITIES, type TaskPriority } from '@repo/shared'
import { Button } from '@repo/ui/components/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@repo/ui/components/popover'
import { Textarea } from '@repo/ui/components/textarea'

import { PriorityTag } from '@/components/atoms/priority-tag'

/**
 * One labelled value, and the shape every row in the panel shares.
 *
 * A fixed label column rather than a two-column grid, because the values are
 * controls of wildly different widths — a badge, a stack of faces, a date —
 * and a grid would size the label column to whichever row happened to be
 * widest. `min-h-8` keeps a row of plain text the same height as a row holding
 * a button, so the list does not jog where an editable field sits.
 */
export function MetaRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-8 items-center gap-4">
      <span className="text-text-disabled body-3 w-28 shrink-0">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  )
}

/**
 * The task's name, edited in place.
 *
 * In place because the drawer is the only screen a title can be changed from,
 * and a heading that opens a form to change one word is a heading nobody
 * changes. Enter saves, Escape abandons, and leaving the field saves — the
 * three things a single-line field is expected to do.
 *
 * A `<textarea>` rather than an `<input>`: titles run to 500 characters and
 * wrap to three lines in a 720px drawer, and an input would scroll them
 * sideways while somebody is reading what they typed. `field-sizing-content`
 * on the shared `Textarea` grows it instead.
 */
export function EditableTitle({
  title,
  pending,
  onSave,
}: {
  title: string
  pending: boolean
  onSave: (title: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  function save() {
    const next = draft?.trim() ?? ''

    setDraft(null)

    if (next !== '' && next !== title) onSave(next)
  }

  if (draft === null) {
    return (
      <button
        type="button"
        // The heading is the button, so the hit area is the words themselves
        // rather than a pencil somebody has to find.
        className="hover:bg-action-hover -mx-2 rounded-md px-2 py-0.5 text-left"
        onClick={() => setDraft(title)}
        aria-label="Rename this task"
      >
        <span className="text-text-primary h5 block text-balance">{title}</span>
      </button>
    )
  }

  return (
    <Textarea
      autoFocus
      rows={1}
      value={draft}
      disabled={pending}
      aria-label="Task title"
      className="h5 -mx-2 w-[calc(100%+1rem)] px-2 py-0.5"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          save()
        }

        // Escape is cancel, and it must not also close the drawer around it —
        // the dialog listens for the same key.
        if (event.key === 'Escape') {
          event.stopPropagation()
          setDraft(null)
        }
      }}
    />
  )
}

/**
 * The description, edited in place with an explicit save.
 *
 * ⚠️ **Explicit, unlike the title, and that is the one asymmetry here.** A
 * description is several lines somebody spent minutes on, and blur-to-save
 * means a stray click on the drawer's own backdrop commits half a thought with
 * no way back. Enter cannot save either, because Enter is a new paragraph.
 * ⌘↵ does, for the people who expect it.
 */
export function EditableDescription({
  description,
  pending,
  onSave,
}: {
  description: string | null
  pending: boolean
  onSave: (description: string | null) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  function save(next: string) {
    setDraft(null)

    const trimmed = next.trim()

    // Empty is a real edit, and `null` is how the API spells it — an empty
    // string would store a description that is present and says nothing.
    if (trimmed !== (description ?? '')) {
      onSave(trimmed === '' ? null : trimmed)
    }
  }

  if (draft === null) {
    return (
      <button
        type="button"
        className="hover:bg-action-hover -mx-2 rounded-md px-2 py-1 text-left"
        onClick={() => setDraft(description ?? '')}
        aria-label="Edit the description"
      >
        {description === null || description === '' ? (
          <span className="text-text-disabled body-2">Add a description…</span>
        ) : (
          <span className="text-text-secondary body-2 block whitespace-pre-wrap">
            {description}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Textarea
        autoFocus
        rows={4}
        value={draft}
        disabled={pending}
        aria-label="Description"
        placeholder="What needs doing, and anything the next person needs to know."
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            save(draft)
          }

          if (event.key === 'Escape') {
            event.stopPropagation()
            setDraft(null)
          }
        }}
      />

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={pending} onClick={() => save(draft)}>
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          color="neutral"
          onClick={() => setDraft(null)}
        >
          Cancel
        </Button>
        <span className="text-text-disabled body-3">⌘↵ to save</span>
      </div>
    </div>
  )
}

/** Urgent first, and "no priority" last — clearing one is not a fifth level. */
const PRIORITY_MENU: (TaskPriority | null)[] = [
  ...[...TASK_PRIORITIES].reverse(),
  null,
]

/**
 * How urgent this is, or nothing.
 *
 * Urgent at the top, which is the same rule the list's group headings follow:
 * meaning, not the order the constant happens to be declared in. `low` first
 * would put the answer nobody is looking for where the eye lands.
 *
 * "No priority" is a choice in the menu rather than a second control, because
 * clearing one is an edit like any other — `priority` is nullable all the way
 * down.
 */
export function PriorityPicker({
  priority,
  pending,
  onChange,
}: {
  priority: TaskPriority | null
  pending: boolean
  onChange: (priority: TaskPriority | null) => void
}) {
  const [open, setOpen] = useState(false)

  function choose(next: TaskPriority | null) {
    setOpen(false)

    if (next !== priority) onChange(next)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={pending}
        aria-label={`Priority: ${priority ?? 'none'}. Change it.`}
        className="hover:bg-action-hover -mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 disabled:opacity-60"
      >
        {priority === null ? (
          <span className="text-text-disabled body-3">No priority</span>
        ) : (
          <PriorityTag priority={priority} />
        )}
        <ChevronDown className="text-text-disabled size-3" />
      </PopoverTrigger>

      {/* `gap-0` for the reason `StatusPicker` gives: `PopoverContent` spaces
          sections, and these are choices in a list. */}
      <PopoverContent align="start" className="w-44 gap-0 p-1.5">
        {PRIORITY_MENU.map((one) => (
          <button
            key={one ?? 'none'}
            type="button"
            onClick={() => choose(one)}
            className="hover:bg-action-hover text-body-md flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left"
          >
            <span className="flex-1">
              {one === null ? (
                <span className="text-text-disabled">No priority</span>
              ) : (
                <PriorityTag priority={one} />
              )}
            </span>
            {one === priority && (
              <Check className="text-primary-main size-3.5 shrink-0" />
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
