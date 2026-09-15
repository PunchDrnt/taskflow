'use client'

import { ListFilter, X } from 'lucide-react'
import { useState } from 'react'

import {
  TASK_PRIORITIES,
  type AssignableRow,
  type StatusRow,
  type TaskPriority,
} from '@repo/shared'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@repo/ui/components/combobox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@repo/ui/components/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select'

import { ToolbarChip } from '@/components/atoms/toolbar-chip'
import { DateField } from '@/components/molecules/date-field'
import {
  activeFilterCount,
  clearedFilters,
  type TaskListQueryState,
  type TaskScope,
} from '@/lib/tasks/query'

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

/** What a rule can be about. The order is the order rows sit in. */
const PROPERTIES = ['status', 'assignee', 'priority', 'due'] as const

type FilterProperty = (typeof PROPERTIES)[number]

const PROPERTY_LABELS: Record<FilterProperty, string> = {
  status: 'Status',
  assignee: 'Assignee',
  priority: 'Priority',
  due: 'Due date',
}

/** How a due-date rule reads, which is the pair of bounds it sets. */
type DueOperator = 'after' | 'before' | 'between'

const DUE_OPERATORS: Record<DueOperator, string> = {
  after: 'is on or after',
  before: 'is on or before',
  between: 'is between',
}

/**
 * Every filter, as rules — one row each, all of them ANDed.
 *
 * **A rule builder rather than a panel of checkbox groups**, because what the
 * list actually supports is a grammar and the old shape hid it: four blocks of
 * ticks say nothing about how the blocks combine, and people reasonably read
 * a wall of checkboxes as "any of these". Spelling each row out as
 * *property · operator · value* puts the grammar on screen — and it is a small
 * grammar, which is the point:
 *
 * **Every rule must match, and several values inside one rule is "is in".**
 * `?priority=high&priority=urgent` means either of those, and that is the only
 * disjunction the API has. An OR across different properties is a query
 * builder, which is Phase 4's saved views rather than a URL somebody sends a
 * colleague — so `is in` is the only operator the first three properties
 * offer, and it is shown rather than implied.
 *
 * ⚠️ **The rows are a view of the URL, not state beside it.** A rule exists
 * because its parameters have values; `drafts` holds only the rows somebody
 * has added and not yet filled, which cannot live in the URL because an empty
 * `statusId` and no `statusId` are the same request. Anything already chosen
 * survives a navigation, a shared link and the back button, which is the whole
 * reason this state is in the query string.
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
  const offered = PROPERTIES.filter((property) =>
    scope.kind === 'project'
      ? true
      : property === 'priority' || property === 'due',
  )

  const [drafts, setDrafts] = useState<FilterProperty[]>([])

  // A row per property that has values, plus the ones added and still empty —
  // in `PROPERTIES` order, so a row never jumps as it is filled in.
  const rows = offered.filter(
    (property) => isSet(query, property) || drafts.includes(property),
  )
  const spare = offered.filter((property) => !rows.includes(property))

  const drop = (property: FilterProperty) => {
    setDrafts((held) => held.filter((one) => one !== property))
    onChange(cleared(property))
  }

  const clearAll = () => {
    setDrafts([])
    onChange(clearedFilters())
  }

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

      <PopoverContent align="start" className="flex w-130 flex-col gap-3 p-3">
        <div className="flex flex-col gap-2">
          {rows.map((property) => (
            <div key={property} className="flex items-start gap-1.5">
              <Select
                value={property}
                onValueChange={(next) => {
                  // Changing what a row is about carries nothing over: the
                  // values belonged to the old property.
                  setDrafts((held) => [
                    ...held.filter((one) => one !== property),
                    next as FilterProperty,
                  ])
                  onChange(cleared(property))
                }}
              >
                <SelectTrigger size="sm" className="w-28 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[property, ...spare].map((option) => (
                    <SelectItem key={option} value={option}>
                      {PROPERTY_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {property === 'due' ? (
                <DueRule query={query} onChange={onChange} />
              ) : (
                <>
                  <Select value="in" disabled>
                    <SelectTrigger size="sm" className="w-24 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">is in</SelectItem>
                    </SelectContent>
                  </Select>

                  <Values
                    property={property}
                    query={query}
                    statuses={statuses}
                    people={people}
                    onChange={onChange}
                  />
                </>
              )}

              <button
                type="button"
                aria-label={`Remove the ${PROPERTY_LABELS[property].toLowerCase()} rule`}
                title="Remove"
                onClick={() => drop(property)}
                className="text-text-disabled hover:bg-action-hover hover:text-error-main flex size-7 shrink-0 items-center justify-center rounded-md"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}

          {rows.length === 0 && (
            <p className="text-text-disabled body-3 py-0.5">
              No filters —{' '}
              {scope.kind === 'project'
                ? 'this view shows every task in the project.'
                : 'this view shows everything assigned to you.'}
            </p>
          )}
        </div>

        <div className="bg-divider-soft h-px" />

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={spare.length === 0}
            onClick={() => setDrafts((held) => [...held, spare[0]!])}
            className="text-primary-main body-3 disabled:text-text-disabled disabled:pointer-events-none"
          >
            + Add filter
          </button>
          <span className="flex-1" />
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={clearAll}
            className="text-text-secondary body-3 hover:text-text-primary disabled:text-text-disabled disabled:pointer-events-none"
          >
            Delete all
          </button>
        </div>

        <p className="text-text-disabled body-3">
          Every rule must match. &ldquo;is in&rdquo; takes several values — any
          one of them is enough.
        </p>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The two bounds a due-date rule can set, read back as an operator.
 *
 * The URL carries `dueFrom` and `dueTo` and nothing else, so which operator a
 * row is showing is derived from which of them is filled rather than stored
 * beside them — one fewer thing that can disagree with the list on screen.
 * Both ends are inclusive, and both are calendar days in the company's zone:
 * the conversion to an instant happens once, in `toApiParams`.
 */
function DueRule({
  query,
  onChange,
}: {
  query: TaskListQueryState
  onChange: (patch: Partial<TaskListQueryState>) => void
}) {
  const operator: DueOperator =
    query.dueFrom !== '' && query.dueTo !== ''
      ? 'between'
      : query.dueTo !== ''
        ? 'before'
        : 'after'

  return (
    <>
      <Select
        value={operator}
        onValueChange={(next) =>
          onChange(
            next === 'after'
              ? { dueTo: '' }
              : next === 'before'
                ? { dueFrom: '' }
                : {},
          )
        }
      >
        <SelectTrigger size="sm" className="w-32 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(DUE_OPERATORS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {operator !== 'before' && (
          <DateField
            label="Due on or after"
            value={query.dueFrom}
            max={query.dueTo}
            onChange={(dueFrom) => onChange({ dueFrom })}
          />
        )}
        {operator === 'between' && (
          <span className="text-text-disabled body-3">to</span>
        )}
        {operator !== 'after' && (
          <DateField
            label="Due on or before"
            value={query.dueTo}
            min={query.dueFrom}
            onChange={(dueTo) => onChange({ dueTo })}
          />
        )}
      </div>
    </>
  )
}

/**
 * The values half of an "is in" rule: a multi-select that can be typed into.
 *
 * `Combobox` rather than a list of checkboxes, and the reason is the assignee
 * list: a hundred people is not a list anybody scrolls, and the same control
 * has to work for four priorities and for a hundred colleagues. What is chosen
 * shows as chips, so a rule says what it is doing while it is shut.
 *
 * Items are ids with a label function rather than objects, so what the URL
 * holds and what the control holds are the same strings — no identity to keep
 * in step, and `itemToStringLabel` is what the typeahead filters on.
 */
function Values({
  property,
  query,
  statuses,
  people,
  onChange,
}: {
  property: Exclude<FilterProperty, 'due'>
  query: TaskListQueryState
  statuses: StatusRow[]
  people: AssignableRow[]
  onChange: (patch: Partial<TaskListQueryState>) => void
}) {
  const anchor = useComboboxAnchor()

  const { items, labels, held, apply, placeholder } = {
    status: {
      items: statuses.map((status) => status.id),
      labels: new Map(statuses.map((status) => [status.id, status.name])),
      held: query.statusId,
      apply: (statusId: string[]) => onChange({ statusId }),
      placeholder: 'Pick statuses',
    },
    assignee: {
      items: people.map((person) => person.userId),
      // Both names, for the reason the picker shows both: at a hundred people
      // the nicknames repeat, and the typeahead matches whichever they typed.
      labels: new Map(
        people.map((person) => [
          person.userId,
          `${person.nickname} (${person.name})`,
        ]),
      ),
      held: query.assigneeId,
      apply: (assigneeId: string[]) => onChange({ assigneeId }),
      placeholder: 'Search people',
    },
    priority: {
      items: [...TASK_PRIORITIES] as string[],
      labels: new Map(
        TASK_PRIORITIES.map((priority) => [
          priority as string,
          PRIORITY_LABELS[priority],
        ]),
      ),
      held: query.priority as string[],
      apply: (priority: string[]) =>
        onChange({ priority: priority as TaskPriority[] }),
      placeholder: 'Pick priorities',
    },
  }[property]

  const labelOf = (value: string) => labels.get(value) ?? value

  return (
    <Combobox
      multiple
      items={items}
      value={held}
      onValueChange={(next: string[]) => apply(next)}
      itemToStringLabel={labelOf}
    >
      <ComboboxChips ref={anchor} className="min-w-0 flex-1">
        {held.map((value) => (
          <ComboboxChip key={value} aria-label={labelOf(value)}>
            {labelOf(value)}
          </ComboboxChip>
        ))}
        <ComboboxChipsInput
          placeholder={held.length === 0 ? placeholder : undefined}
        />
      </ComboboxChips>

      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>Nothing matches.</ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {labelOf(item)}
              </ComboboxItem>
            )}
          </ComboboxCollection>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/** Whether this property is filtering on anything right now. */
function isSet(query: TaskListQueryState, property: FilterProperty): boolean {
  switch (property) {
    case 'status':
      return query.statusId.length > 0
    case 'assignee':
      return query.assigneeId.length > 0
    case 'priority':
      return query.priority.length > 0
    case 'due':
      return query.dueFrom !== '' || query.dueTo !== ''
  }
}

/** That property's parameters, emptied. */
function cleared(property: FilterProperty): Partial<TaskListQueryState> {
  switch (property) {
    case 'status':
      return { statusId: [] }
    case 'assignee':
      return { assigneeId: [] }
    case 'priority':
      return { priority: [] }
    case 'due':
      return { dueFrom: '', dueTo: '' }
  }
}
