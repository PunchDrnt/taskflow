'use client'

import { ListFilter } from 'lucide-react'
import { useId } from 'react'

import {
  TASK_PRIORITIES,
  type AssignableRow,
  type StatusRow,
  type TaskPriority,
} from '@repo/shared'
import { Button } from '@repo/ui/components/button'
import { Checkbox } from '@repo/ui/components/checkbox'
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@repo/ui/components/field'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@repo/ui/components/popover'

import {
  activeFilterCount,
  clearedFilters,
  type TaskListQueryState,
  type TaskScope,
} from '../../lib/tasks/query'
import { StatusBadge } from '../atoms/status-badge'
import { ToolbarChip } from '../atoms/toolbar-chip'
import { DateField } from '../molecules/date-field'

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

/**
 * Every filter, behind one button.
 *
 * Inline they were seven controls competing with the search box, the sort and
 * the grouping — and those are not the same kind of thing. Sorting and
 * grouping rearrange what is already on screen; a filter decides what is on it
 * at all. The count on the button is what keeps that decision visible once the
 * popover is shut, which is the only real cost of hiding them.
 *
 * **Every condition is ANDed, and several values inside one are "is in".**
 * `?priority=high&priority=urgent` means either of those, and that is the only
 * disjunction the API has. An OR across different fields is a query builder,
 * which is Phase 4's saved views rather than a URL somebody sends a colleague.
 *
 * Status and assignee appear on a project only. A status id belongs to one
 * board — two projects' "In progress" are two different rows — and on My Tasks
 * the assignee is always the caller.
 */
export function TaskFilters({
  query,
  scope,
  statuses,
  people,
  onChange,
}: {
  query: TaskListQueryState
  scope: TaskScope
  /** The project's own columns. Empty on My Tasks. */
  statuses: StatusRow[]
  /** Who this project can hand work to. Empty on My Tasks. */
  people: AssignableRow[]
  onChange: (patch: Partial<TaskListQueryState>) => void
}) {
  const active = activeFilterCount(query)

  const toggle = <T extends string>(held: T[], value: T): T[] =>
    held.includes(value)
      ? held.filter((one) => one !== value)
      : [...held, value]

  return (
    <Popover>
      <PopoverTrigger
        render={
          <ToolbarChip
            icon={<ListFilter />}
            label="Filter"
            value={active === 0 ? null : String(active)}
          />
        }
      />

      <PopoverContent align="start" className="flex w-72 flex-col gap-4">
        <Group label="Priority">
          {TASK_PRIORITIES.map((priority) => (
            <Tick
              key={priority}
              checked={query.priority.includes(priority)}
              onToggle={() =>
                onChange({ priority: toggle(query.priority, priority) })
              }
            >
              {PRIORITY_LABELS[priority]}
            </Tick>
          ))}
        </Group>

        {scope.kind === 'project' && statuses.length > 0 && (
          <Group label="Status">
            {statuses.map((status) => (
              <Tick
                key={status.id}
                checked={query.statusId.includes(status.id)}
                onToggle={() =>
                  onChange({ statusId: toggle(query.statusId, status.id) })
                }
              >
                <StatusBadge status={status} />
              </Tick>
            ))}
          </Group>
        )}

        {scope.kind === 'project' && people.length > 0 && (
          <Group label="Assignee">
            <div className="max-h-40 overflow-y-auto">
              {people.map((person) => (
                <Tick
                  key={person.userId}
                  checked={query.assigneeId.includes(person.userId)}
                  onToggle={() =>
                    onChange({
                      assigneeId: toggle(query.assigneeId, person.userId),
                    })
                  }
                >
                  {/* Both names, for the reason the picker shows both: at a
                      hundred people the nicknames repeat. */}
                  {person.nickname}{' '}
                  <span className="text-text-secondary">({person.name})</span>
                </Tick>
              ))}
            </div>
          </Group>
        )}

        <Group label="Due between">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <DateField
              label="Due on or after"
              value={query.dueFrom}
              max={query.dueTo}
              onChange={(dueFrom) => onChange({ dueFrom })}
            />
            <span className="text-text-disabled body-3">to</span>
            <DateField
              label="Due on or before"
              value={query.dueTo}
              min={query.dueFrom}
              onChange={(dueTo) => onChange({ dueTo })}
            />
          </div>
          <FieldDescription>
            Both ends included, read in the company&apos;s time zone.
          </FieldDescription>
        </Group>

        {active > 0 && (
          <Button
            variant="ghost"
            color="primary"
            size="sm"
            className="w-fit"
            onClick={() => onChange(clearedFilters())}
          >
            Clear {active} filter{active === 1 ? '' : 's'}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * One named block of choices inside the panel.
 *
 * `FieldSet`/`FieldLegend` rather than a styled `<fieldset>`: a group of
 * checkboxes needs a real legend for a screen reader to announce what the
 * boxes are choices *of*, and the design system already draws one.
 */
function Group({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <FieldSet className="gap-1.5">
      <FieldLegend variant="label">{label}</FieldLegend>
      {children}
    </FieldSet>
  )
}

function Tick({
  checked,
  onToggle,
  children,
}: {
  checked: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  // An explicit id rather than a <label> wrapped around the control: Base UI's
  // Checkbox renders a <button role="checkbox">, and implicit labelling only
  // ever reaches a real form control — so wrapping it looks associated and is
  // not, which costs the label its click target and the box its accessible
  // name in one go.
  const id = useId()

  return (
    <Field orientation="horizontal" className="gap-2 py-0.5">
      <Checkbox id={id} checked={checked} onCheckedChange={onToggle} />
      <FieldLabel htmlFor={id} className="cursor-pointer font-normal">
        {children}
      </FieldLabel>
    </Field>
  )
}
