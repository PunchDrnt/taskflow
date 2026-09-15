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
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react'
import { useOptimistic, useState, useTransition } from 'react'

import {
  STATUS_KINDS,
  type StatusColor,
  type StatusKind,
  type StatusRow,
} from '@repo/shared'
import { Button } from '@repo/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu'
import { Input } from '@repo/ui/components/input'
import { RadioGroup, RadioGroupItem } from '@repo/ui/components/radio-group'

import {
  addStatus,
  changeStatus,
  removeStatus,
} from '@/app/(signed-in)/(org)/projects/[projectKey]/settings/status-actions'
import { PaletteMenu } from '@/components/molecules/palette-menu'
import type { StatusOutcome } from '@/lib/statuses/outcome'

/**
 * What each kind is called, what choosing it does, and the palette colour the
 * design gives it — green for done, pink for cancelled, nothing for open.
 *
 * "Open" rather than "In progress": the project's own first column is usually
 * called In progress, and a type menu offering it beside a status named it is
 * two different things wearing one word. The note is what actually separates
 * the two closed kinds — both end the work, only one of them did it.
 *
 * ⚠️ `tone` is a **token name, not a class**. The eight palette colours are
 * declared outside `@theme` on purpose — `theme.css` explains why — so there
 * is no `bg-status-green-soft` utility to write and a class spelled that way
 * resolves to nothing at all. They are reached through `var()` in a style
 * attribute, the same as `ProjectDot` and `PaletteMenu`.
 */
const KINDS: Record<
  StatusKind,
  { label: string; note: string; tone: StatusColor | null }
> = {
  normal: { label: 'Open', note: 'Still to be worked on', tone: null },
  done: { label: 'Counts as done', note: 'Closes the task', tone: 'green' },
  cancelled: {
    label: 'Counts as cancelled',
    note: 'Closed without doing it',
    tone: 'pink',
  },
}

/**
 * A project's columns: add, rename, recolour, retype, reorder, remove.
 *
 * Everything writes immediately and then re-reads. Five rules hold this table
 * together and none of them is about one row — a project always keeps at least
 * one status, at least one that counts as finished, whatever it has for
 * abandoned work, and exactly one default — so a change here can move a row
 * nobody touched, and a screen that patched only what was edited would show a
 * board the server does not have.
 *
 * ⚠️ **Changing what a status counts as reaches the tasks in it.** Marking a
 * column done stamps a completion on everything sitting in it, and unmarking
 * it clears them again; that is why the delete button carries the count in its
 * tooltip rather than the row carrying a column of numbers — the number
 * matters at the moment somebody is about to act on it, and nowhere else.
 */
export function StatusSettings({
  projectId,
  statuses,
}: {
  projectId: string
  statuses: StatusRow[]
}) {
  // ⚠️ `useOptimistic`, not `useState`. A dragged row has to follow the
  // pointer before the server has agreed, but every other write here re-reads
  // the page — and state seeded from a prop ignores the prop ever after, so a
  // rename or a new status would have come back from the server and not shown
  // up. This holds the reordering for exactly as long as the transition that
  // caused it, then defers to `statuses` again.
  const [order, reorder] = useOptimistic(
    statuses,
    (_current, next: StatusRow[]) => next,
  )
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  /** The status new tasks start in — the whole list's single choice. */
  const current = order.find((one) => one.isDefault)?.id ?? null

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

  /**
   * Puts one status at `to`, wherever the instruction came from.
   *
   * Dragging and the two arrows are the same move — the design offers both
   * because a list of five rows is faster to nudge than to drag, and a drag is
   * the only way to cross four of them at once.
   */
  function moveTo(statusId: string, to: number) {
    const from = order.findIndex((one) => one.id === statusId)

    if (from === -1 || to < 0 || to >= order.length || to === from) return

    const moved = arrayMove(order, from, to)

    // ⚠️ `afterId`, never a sort key. The key is fractional-index arithmetic
    // that is only correct against the current neighbours; naming the
    // neighbour is the part this side actually knows. Null means first.
    const afterId = to === 0 ? null : (moved[to - 1]?.id ?? null)

    setFailure(null)
    startTransition(async () => {
      // Inside the transition, which is what an optimistic update is scoped
      // to: called outside one it would be applied and never taken back.
      reorder(moved)

      const result = await changeStatus(projectId, statusId, { afterId })

      if (!result.ok) setFailure(result.message)
    })
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (over === null || active.id === over.id) return

    moveTo(
      String(active.id),
      order.findIndex((one) => one.id === over.id),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-secondary body-3 max-w-155">
        Each project keeps its own set. Order here is the order on the board.
      </p>

      {failure !== null && (
        <p
          role="alert"
          className="border-error-main/30 bg-error-main/10 text-error-main body-2 rounded-md border px-3 py-2"
        >
          {failure}
        </p>
      )}

      <div className="bg-paper-elevation-1 border-divider flex flex-col gap-2.5 rounded-lg border p-4">
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
            {/* One `RadioGroup` around the whole list, not a control per row:
                "which status do new tasks start in" is a single choice made
                across the rows, and that is what gives the set arrow-key
                navigation and one tab stop instead of one per status. */}
            <RadioGroup
              aria-label="Status new tasks start in"
              value={current}
              onValueChange={(id) => {
                // Only when it actually moved. A group re-emitting the value
                // it already holds is ordinary — a re-render, a restored
                // focus — and without this each one is a request, an audit row
                // and a history entry saying the default changed to itself.
                if (id === current) return

                run(() =>
                  changeStatus(projectId, String(id), { isDefault: true }),
                )
              }}
              render={<ul className="flex flex-col gap-2.5" />}
            >
              {order.map((status, index) => (
                <StatusRowItem
                  key={status.id}
                  status={status}
                  busy={pending}
                  first={index === 0}
                  last={index === order.length - 1}
                  deletable={deletableReason(status, order)}
                  onMove={(delta) => moveTo(status.id, index + delta)}
                  onChange={(patch) =>
                    run(() => changeStatus(projectId, status.id, patch))
                  }
                  onRemove={() => run(() => removeStatus(projectId, status.id))}
                />
              ))}
            </RadioGroup>
          </SortableContext>
        </DndContext>

        {/* One press adds a row and nothing else — the name, the colour and
            the kind are all edited in place a line below, so a form here
            would be a second way to say the same three things. */}
        <Button
          variant="outline"
          color="neutral"
          size="sm"
          disabled={pending}
          className="border-divider hover:text-primary-main hover:border-primary-outlined-border self-start border-dashed"
          onClick={() =>
            run(() =>
              addStatus(projectId, {
                name: freshName(order),
                color: 'gray',
                kind: 'normal',
              }),
            )
          }
        >
          <Plus />
          Add status
        </Button>

        <p className="text-text-disabled body-3">
          A status still in use cannot be deleted — move those tasks first.
          Exactly one status is the starting status for new tasks.
        </p>
      </div>
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

  const floor = KIND_FLOORS.find(
    (one) =>
      status.kind === one.kind &&
      all.filter((other) => other.kind === one.kind).length <= 1,
  )

  return floor?.reason ?? null
}

/**
 * The kinds a project may not run out of — `StatusService.lastOfItsKind`, said
 * in the words that fit on a tooltip.
 *
 * The cancelled floor is the one people are surprised by, so the reason says
 * what goes wrong rather than restating the rule: work that is abandoned ends
 * up marked done, and every progress figure computed afterwards is wrong.
 */
const KIND_FLOORS: { kind: StatusKind; reason: string }[] = [
  {
    kind: 'done',
    reason: 'A project needs one status that counts as finished',
  },
  {
    kind: 'cancelled',
    reason:
      'A project needs one status for abandoned work, or it gets filed as done',
  },
]

/** "New status", or the first numbered one this project does not have. */
function freshName(all: StatusRow[]): string {
  const taken = new Set(all.map((one) => one.name))

  if (!taken.has('New status')) return 'New status'

  let n = 2

  while (taken.has(`New status ${n}`)) n += 1

  return `New status ${n}`
}

function StatusRowItem({
  status,
  busy,
  first,
  last,
  deletable,
  onMove,
  onChange,
  onRemove,
}: {
  status: StatusRow
  busy: boolean
  first: boolean
  last: boolean
  deletable: string | null
  onMove: (delta: -1 | 1) => void
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
      className={`border-divider flex items-center gap-2.5 rounded-md border px-2.5 py-2 ${
        isDragging
          ? 'bg-paper-elevation-2 relative z-10'
          : 'bg-paper-elevation-0'
      }`}
    >
      <button
        type="button"
        aria-label={`Reorder ${status.name}`}
        className="text-text-disabled hover:text-text-secondary shrink-0 cursor-grab touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      {/* The arrows beside the handle, both in the design: dragging is the
          fast way across a long list and the impossible way on a touchpad,
          and these are the only path a keyboard has without dnd-kit's. */}
      <span className="flex shrink-0 flex-col">
        <MoveButton
          label={`Move ${status.name} up`}
          disabled={busy || first}
          onClick={() => onMove(-1)}
        >
          <ChevronUp className="size-3" />
        </MoveButton>
        <MoveButton
          label={`Move ${status.name} down`}
          disabled={busy || last}
          onClick={() => onMove(1)}
        >
          <ChevronDown className="size-3" />
        </MoveButton>
      </span>

      <Input
        value={name}
        disabled={busy}
        aria-label={`Name of ${status.name}`}
        // Borderless until it is being used. Five bordered boxes down the
        // card read as a form to fill in; the design shows the names as text
        // that happens to be editable, and offers the frame on focus.
        className="focus:border-divider focus:bg-paper-elevation-1 h-7 min-w-0 flex-1 border-transparent bg-transparent"
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

      <PaletteMenu
        value={status.color}
        disabled={busy}
        onPick={(color: StatusColor) => onChange({ color })}
      />

      <KindPill
        value={status.kind}
        disabled={busy}
        onPick={(kind) => onChange({ kind })}
      />

      {/* No `onChange` of its own: the group above owns the choice, which is
          also why nothing here can clear a default without naming its
          replacement — a project always has exactly one. */}
      <RadioGroupItem
        variant="pill"
        value={status.id}
        disabled={busy}
        className="body-3 w-24 whitespace-nowrap"
        aria-label={`Start new tasks in ${status.name}`}
      >
        {status.isDefault ? 'Default' : 'Set default'}
      </RadioGroupItem>

      <Button
        variant="ghost"
        size="icon-sm"
        disabled={busy || deletable !== null}
        title={deletable ?? `Delete ${status.name}`}
        aria-label={deletable ?? `Delete ${status.name}`}
        className="text-text-disabled hover:text-error-light size-6"
        onClick={onRemove}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  )
}

/** One of the two nudges beside the drag handle. */
function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="text-text-disabled hover:bg-action-hover hover:text-text-secondary flex h-3.5 w-4 items-center justify-center rounded-sm disabled:pointer-events-none disabled:opacity-25"
    >
      {children}
    </button>
  )
}

/**
 * What a status counts as, as the coloured chip the design draws.
 *
 * A menu rather than a `Select` because each option needs its note: "counts as
 * done" and "counts as cancelled" both close a task and the difference between
 * them is the sentence underneath, which a select's one-line trigger has
 * nowhere to put.
 */
function KindPill({
  value,
  disabled,
  onPick,
}: {
  value: StatusKind
  disabled: boolean
  onPick: (kind: StatusKind) => void
}) {
  const { label, tone } = KINDS[value]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            aria-label={`Counts as: ${label}`}
            className={`body-3 flex w-40 shrink-0 items-center justify-center gap-1 rounded-full px-2 py-0.5 font-medium whitespace-nowrap disabled:opacity-50 ${
              tone === null ? 'bg-action-hover text-text-secondary' : ''
            }`}
            style={
              tone === null
                ? undefined
                : {
                    backgroundColor: `var(--color-status-${tone}-soft)`,
                    color: `var(--color-status-${tone}-text)`,
                  }
            }
          >
            {label}
            <ChevronDown className="size-3 shrink-0 opacity-75" />
          </button>
        }
      />

      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(kind) => onPick(kind as StatusKind)}
        >
          {STATUS_KINDS.map((kind) => (
            <DropdownMenuRadioItem key={kind} value={kind}>
              <span className="flex flex-col gap-0.5">
                <span>{KINDS[kind].label}</span>
                <span className="text-text-disabled body-3">
                  {KINDS[kind].note}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
