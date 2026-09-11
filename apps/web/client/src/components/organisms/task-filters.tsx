'use client'

import { ListFilter } from 'lucide-react'

import {
  TASK_PRIORITIES,
  type AssignableRow,
  type StatusRow,
  type TaskPriority,
} from '@repo/shared'
import { Button } from '@repo/ui/components/button'
import { Checkbox } from '@repo/ui/components/checkbox'
import { Input } from '@repo/ui/components/input'
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
          <Button
            variant={active > 0 ? 'secondary' : 'outline'}
            color="primary"
            size="sm"
          >
            <ListFilter />
            Filters
            {active > 0 && <span className="tabular-nums">({active})</span>}
          </Button>
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
          <div className="flex items-center gap-2">
            <Input
              type="date"
              className="h-8"
              aria-label="Due on or after"
              value={query.dueFrom}
              max={query.dueTo === '' ? undefined : query.dueTo}
              onChange={(event) => onChange({ dueFrom: event.target.value })}
            />
            <span className="text-text-disabled body-3">to</span>
            <Input
              type="date"
              className="h-8"
              aria-label="Due on or before"
              value={query.dueTo}
              min={query.dueFrom === '' ? undefined : query.dueFrom}
              onChange={(event) => onChange({ dueTo: event.target.value })}
            />
          </div>
          <p className="text-text-disabled body-3">
            Both ends included, read in the company&apos;s time zone.
          </p>
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

function Group({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="label-medium text-text-secondary mb-1">{label}</legend>
      {children}
    </fieldset>
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
  return (
    <label className="body-2 text-text-primary flex cursor-pointer items-center gap-2 py-0.5">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      {children}
    </label>
  )
}
