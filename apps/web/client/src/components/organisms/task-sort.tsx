'use client'

import { ArrowDownUp, X } from 'lucide-react'

import type { TaskSortField, TaskSortRule } from '@repo/shared'
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

import {
  defaultQueryFor,
  isSorted,
  MAX_TASK_SORT_RULES,
  SORT_LABELS,
  unusedSortsFor,
  type TaskListQueryState,
  type TaskScope,
} from '../../lib/tasks/query'
import { ToolbarChip } from '../atoms/toolbar-chip'

/**
 * How the list is ordered — one rule per row, applied in the order they sit.
 *
 * **Several rules, because one is not how anybody describes an order.** "The
 * urgent ones first, and inside those the nearest deadline" is two rules, and
 * a list offering only the first answers a different question: it sorts by
 * priority and then leaves everything inside each band in whatever order the
 * database returned, which changes as work is edited.
 *
 * ⚠️ **Three rules, and the ceiling comes from the cursor rather than from
 * taste.** Resuming a multi-key sort is an OR-chain with one branch per rule
 * (`TaskService.paginate`), so each rule widens the predicate behind every
 * page of every list. `MAX_SORT_RULES` is where the API stops; this reads it
 * rather than restating the number.
 *
 * A field appears in at most one rule. A second rule on `priority` can only
 * break ties the first already settled, so the pickers offer what is left
 * rather than letting a row be added that does nothing.
 *
 * Direction is a `Select` next to the field rather than a toggle on it: the
 * two halves are one sentence — "priority, descending" — and a toggle hides
 * which way it is currently pointing behind an icon somebody has to learn.
 */
export function TaskSort({
  query,
  scope,
  onChange,
}: {
  query: TaskListQueryState
  scope: TaskScope
  onChange: (patch: Partial<TaskListQueryState>) => void
}) {
  const rules = query.sort
  const available = unusedSortsFor(scope, rules)
  const sorted = isSorted(query, scope)

  const replace = (index: number, rule: TaskSortRule) =>
    onChange({
      sort: rules.map((held, at) => (at === index ? rule : held)),
    })

  const move = (index: number, by: number) => {
    const next = [...rules]
    const [rule] = next.splice(index, 1)

    next.splice(index + by, 0, rule!)
    onChange({ sort: next })
  }

  const remove = (index: number) => {
    const next = rules.filter((_, at) => at !== index)

    // Never nothing: a list with no ordering has no position for a cursor to
    // resume from, so removing the last rule restores the list's own order
    // rather than leaving it unsorted.
    onChange({ sort: next.length === 0 ? defaultQueryFor(scope).sort : next })
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <ToolbarChip
            icon={<ArrowDownUp />}
            label="Sort"
            value={sorted ? summarise(rules) : null}
          />
        }
      />

      <PopoverContent align="start" className="flex w-88 flex-col gap-3 p-3">
        <div className="flex flex-col gap-1.5">
          {rules.map((rule, index) => (
            <div key={rule.field} className="flex items-center gap-1.5">
              <Select
                value={rule.field}
                onValueChange={(field) =>
                  replace(index, { ...rule, field: field as TaskSortField })
                }
              >
                <SelectTrigger size="sm" className="min-w-0 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* The field this row already holds stays in its own list —
                      a select whose current value is missing renders blank. */}
                  {unusedSortsFor(scope, rules, rule.field).map((field) => (
                    <SelectItem key={field} value={field}>
                      {SORT_LABELS[field]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={rule.dir}
                onValueChange={(dir) =>
                  replace(index, { ...rule, dir: dir as 'asc' | 'desc' })
                }
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>

              <RowButton
                label="Move up"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                ↑
              </RowButton>
              <RowButton
                label="Move down"
                disabled={index === rules.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </RowButton>
              <RowButton
                label={`Remove ${SORT_LABELS[rule.field]}`}
                onClick={() => remove(index)}
                className="hover:text-error-main"
              >
                <X className="size-3" />
              </RowButton>
            </div>
          ))}
        </div>

        <div className="bg-divider-soft h-px" />

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={
              available.length === 0 || rules.length >= MAX_TASK_SORT_RULES
            }
            onClick={() =>
              onChange({
                sort: [...rules, { field: available[0]!, dir: 'asc' }],
              })
            }
            className="text-primary-main body-3 disabled:text-text-disabled disabled:pointer-events-none"
          >
            + Add sort
          </button>
          <span className="flex-1" />
          <button
            type="button"
            disabled={!sorted}
            onClick={() => onChange({ sort: defaultQueryFor(scope).sort })}
            className="text-text-secondary body-3 hover:text-text-primary disabled:text-text-disabled disabled:pointer-events-none"
          >
            Reset
          </button>
        </div>

        <p className="text-text-disabled body-3">
          Rules apply in order: the second only decides rows the first leaves
          tied.
        </p>
      </PopoverContent>
    </Popover>
  )
}

/** The chip's own label: the first rule, and how many follow it. */
function summarise(rules: readonly TaskSortRule[]): string {
  const [first, ...rest] = rules
  const arrow = first!.dir === 'asc' ? '↑' : '↓'

  return `${SORT_LABELS[first!.field]} ${arrow}${rest.length > 0 ? ` +${rest.length}` : ''}`
}

/**
 * One of the three square controls at the end of a rule.
 *
 * A `<button>` with an `aria-label` rather than an icon in a `<span>`: these
 * reorder and delete the thing the row describes, and a screen reader reading
 * "↑" three times in a row says nothing about which rule moves.
 */
function RowButton({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`text-text-disabled hover:bg-action-hover hover:text-text-primary body-3 flex size-6 shrink-0 items-center justify-center rounded-md disabled:pointer-events-none disabled:opacity-40 ${className ?? ''}`}
      {...props}
    >
      {children}
    </button>
  )
}
