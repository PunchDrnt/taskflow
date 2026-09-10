'use client'

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import {
  STATUS_KINDS,
  type StatusColor,
  type StatusKind,
  type StatusRow,
} from '@repo/shared'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select'

import {
  addStatus,
  changeStatus,
  removeStatus,
} from '../../app/(signed-in)/projects/[projectId]/statuses/actions'
import type { StatusOutcome } from '../../lib/statuses/outcome'
import { PaletteMenu } from '../molecules/palette-menu'

const KIND_LABELS: Record<StatusKind, string> = {
  normal: 'In progress',
  done: 'Counts as done',
  cancelled: 'Counts as cancelled',
}

/**
 * The same list as `items` for Base UI's `Select`.
 *
 * ⚠️ Not optional. `SelectValue` renders the *value* unless the root was told
 * how values map to labels, so leaving it off draws `normal` and `done` in the
 * trigger while the open menu shows the real labels — a mismatch that only
 * appears once the menu is closed, which is most of the time.
 */
const KIND_ITEMS = STATUS_KINDS.map((kind) => ({
  value: kind,
  label: KIND_LABELS[kind],
}))

/**
 * A project's columns: add, rename, recolour, retype, reorder, remove.
 *
 * Everything writes immediately and then re-reads. Four rules hold this table
 * together and none of them is about one row — a project always keeps at least
 * one status, at least one that counts as finished, and exactly one default —
 * so a change here can move a row nobody touched, and a screen that patched
 * only what was edited would show a board the server does not have.
 *
 * ⚠️ **Changing what a status counts as reaches the tasks in it.** Marking a
 * column done stamps a completion on everything sitting in it, and unmarking
 * it clears them again; the count beside each row is there so that is a
 * decision somebody makes with the number in front of them rather than a
 * surprise afterwards.
 */
export function StatusSettings({
  projectId,
  statuses,
}: {
  projectId: string
  statuses: StatusRow[]
}) {
  // Ordering is optimistic — the row follows the pointer and settles when the
  // server agrees. Everything else re-reads, because everything else can move
  // a row the person did not touch.
  const [order, setOrder] = useState(statuses)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // A drag needs intent. Without a distance threshold every click on the
      // handle starts one, and the buttons beside it stop responding.
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function run(action: () => Promise<StatusOutcome>) {
    setFailure(null)
    startTransition(async () => {
      const result = await action()

      if (!result.ok) setFailure(result.message)
    })
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (over === null || active.id === over.id) return

    const from = order.findIndex((one) => one.id === active.id)
    const to = order.findIndex((one) => one.id === over.id)

    if (from === -1 || to === -1) return

    const moved = arrayMove(order, from, to)
    setOrder(moved)

    // ⚠️ `afterId`, never a sort key. The key is fractional-index arithmetic
    // that is only correct against the current neighbours; naming the
    // neighbour is the part this side actually knows. Null means first.
    const afterId = to === 0 ? null : (moved[to - 1]?.id ?? null)

    run(() => changeStatus(projectId, String(active.id), { afterId }))
  }

  return (
    <div className="flex flex-col gap-4">
      {failure !== null && (
        <p
          role="alert"
          className="border-error-main/30 bg-error-main/10 text-error-main body-2 rounded-md border px-3 py-2"
        >
          {failure}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={order.map((one) => one.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="bg-paper-elevation-0 border-divider flex flex-col rounded-lg border">
            {order.map((status) => (
              <StatusRowItem
                key={status.id}
                status={status}
                busy={pending}
                deletable={deletableReason(status, order)}
                onChange={(patch) =>
                  run(() => changeStatus(projectId, status.id, patch))
                }
                onRemove={() => run(() => removeStatus(projectId, status.id))}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <AddStatus
        busy={pending}
        onAdd={(form) => run(() => addStatus(projectId, form))}
      />
    </div>
  )
}

/**
 * Why the delete button is off, or null when it is on.
 *
 * Answered here rather than by pressing it and reading the error, which the
 * checklist asks for by name: the count is on the wire so the button can be
 * greyed with the reason attached. The server enforces all of this again —
 * this is the explanation, not the rule.
 */
function deletableReason(status: StatusRow, all: StatusRow[]): string | null {
  if (status.taskCount > 0) {
    return `${status.taskCount} ${status.taskCount === 1 ? 'task is' : 'tasks are'} in this status`
  }

  if (all.length <= 1) return 'A project needs at least one status'
  if (status.isDefault) return 'New tasks start here'

  if (
    status.kind === 'done' &&
    all.filter((one) => one.kind === 'done').length <= 1
  ) {
    return 'A project needs one status that counts as finished'
  }

  return null
}

function StatusRowItem({
  status,
  busy,
  deletable,
  onChange,
  onRemove,
}: {
  status: StatusRow
  busy: boolean
  deletable: string | null
  onChange: (patch: Record<string, unknown>) => void
  onRemove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: status.id })

  const [name, setName] = useState(status.name)

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`border-divider flex items-center gap-2 border-b p-2 last:border-b-0 ${
        isDragging ? 'bg-paper-elevation-2 relative z-10' : ''
      }`}
    >
      <button
        type="button"
        aria-label={`Reorder ${status.name}`}
        className="text-text-disabled hover:text-text-secondary cursor-grab touch-none p-1"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <PaletteMenu
        value={status.color}
        disabled={busy}
        onPick={(color: StatusColor) => onChange({ color })}
      />

      <Input
        value={name}
        disabled={busy}
        aria-label={`Name of ${status.name}`}
        className="h-8 min-w-0 flex-1"
        onChange={(event) => setName(event.target.value)}
        // On blur, not on every keystroke: a request per character would write
        // an audit row per character too.
        onBlur={() => {
          const typed = name.trim()

          if (typed === '' || typed === status.name) {
            setName(status.name)

            return
          }

          onChange({ name: typed })
        }}
      />

      <Select
        items={KIND_ITEMS}
        value={status.kind}
        disabled={busy}
        onValueChange={(kind) => onChange({ kind })}
      >
        <SelectTrigger size="sm" className="w-44" aria-label="Counts as">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_KINDS.map((kind) => (
            <SelectItem key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="text-text-secondary body-3 flex shrink-0 items-center gap-1.5">
        <input
          type="radio"
          name="default-status"
          checked={status.isDefault}
          disabled={busy}
          // Only `true` is meaningful — a project always has exactly one
          // default, so there is no request that clears one without naming
          // its replacement.
          onChange={() => onChange({ isDefault: true })}
        />
        Default
      </label>

      <span className="text-text-disabled body-3 w-16 shrink-0 text-right tabular-nums">
        {status.taskCount} {status.taskCount === 1 ? 'task' : 'tasks'}
      </span>

      <Button
        variant="ghost"
        color="error"
        size="icon-sm"
        disabled={busy || deletable !== null}
        title={deletable ?? `Delete ${status.name}`}
        aria-label={deletable ?? `Delete ${status.name}`}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </li>
  )
}

/** A new column always goes on the end — nobody asked for a position. */
function AddStatus({
  busy,
  onAdd,
}: {
  busy: boolean
  onAdd: (form: { name: string; color: string; kind: string }) => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<StatusColor>('gray')
  const [kind, setKind] = useState<StatusKind>('normal')

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()

        if (name.trim() === '') return

        onAdd({ name: name.trim(), color, kind })
        setName('')
      }}
    >
      <PaletteMenu value={color} disabled={busy} onPick={setColor} />

      <Input
        value={name}
        disabled={busy}
        placeholder="Add a status"
        aria-label="New status name"
        className="h-8 min-w-0 flex-1"
        onChange={(event) => setName(event.target.value)}
      />

      <Select
        items={KIND_ITEMS}
        value={kind}
        disabled={busy}
        onValueChange={(next) => setKind(next as StatusKind)}
      >
        <SelectTrigger size="sm" className="w-44" aria-label="Counts as">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_KINDS.map((one) => (
            <SelectItem key={one} value={one}>
              {KIND_LABELS[one]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button type="submit" color="primary" size="sm" disabled={busy}>
        <Plus />
        Add
      </Button>
    </form>
  )
}
