'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import type { AssignableRow, StatusRow } from '@repo/shared'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select'
import { Switch } from '@repo/ui/components/switch'

import {
  GROUPING_LABELS,
  groupingsFor,
  SORT_LABELS,
  sortsFor,
  toSearchParams,
  type TaskListQueryState,
  type TaskScope,
} from '../../lib/tasks/query'
import { TaskFilters } from './task-filters'

/**
 * The controls above a task list, every one of which writes to the URL.
 *
 * No state is held here beyond the search box's unsent keystrokes. Changing a
 * control navigates, the server re-renders with the new query, and the list
 * below remounts on it — which is what makes a filtered list a link somebody
 * can send, and what makes the back button undo a filter.
 *
 * The search box is the exception, and only until Enter: pushing a URL per
 * keystroke would put a history entry behind every letter and ask the API for
 * a page nobody waited to see.
 *
 * The filters live behind one button rather than in this row, because they are
 * a different kind of control: sorting and grouping rearrange what is already
 * on screen, a filter decides what is on it at all. See `TaskFilters`.
 */
export function TaskToolbar({
  query,
  scope,
  statuses = [],
  people = [],
}: {
  query: TaskListQueryState
  scope: TaskScope
  /** The project's columns, for the status filter. Absent on My Tasks. */
  statuses?: StatusRow[]
  /** Who the project can assign to, for the assignee filter. Absent on My Tasks. */
  people?: AssignableRow[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState(query.q)

  function go(patch: Partial<TaskListQueryState>) {
    const next = toSearchParams({ ...query, ...patch }, scope).toString()

    startTransition(() => {
      router.push(next === '' ? pathname : `${pathname}?${next}`)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-pending={pending}>
      <form
        className="min-w-48 flex-1"
        onSubmit={(event) => {
          event.preventDefault()
          go({ q: draft.trim() })
        }}
      >
        <label className="sr-only" htmlFor="task-search">
          Search titles
        </label>
        <Input
          id="task-search"
          type="search"
          placeholder="Search titles"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </form>

      <TaskFilters
        query={query}
        scope={scope}
        statuses={statuses}
        people={people}
        onChange={go}
      />

      <Picker
        id="task-sort"
        label="Sort by"
        value={query.sort}
        options={sortsFor(scope).map((sort) => [sort, SORT_LABELS[sort]])}
        onChange={(sort) => go({ sort })}
      />

      <Button
        variant="outline"
        color="primary"
        size="icon-sm"
        aria-label={query.dir === 'asc' ? 'Sort ascending' : 'Sort descending'}
        onClick={() => go({ dir: query.dir === 'asc' ? 'desc' : 'asc' })}
      >
        {query.dir === 'asc' ? <ArrowUp /> : <ArrowDown />}
      </Button>

      <Picker
        id="task-group"
        label="Group by"
        value={query.group}
        options={groupingsFor(scope).map((group) => [
          group,
          GROUPING_LABELS[group],
        ])}
        onChange={(group) => go({ group })}
      />

      {/* Only My Tasks hides closed work. A project's Done column is part of
          its board — hiding it there would hide a status somebody made. */}
      {scope.kind === 'mine' && (
        <label className="text-text-secondary body-3 flex items-center gap-2">
          <Switch
            checked={query.includeClosed}
            onCheckedChange={(includeClosed) => go({ includeClosed })}
          />
          Show closed
        </label>
      )}
    </div>
  )
}

/** A labelled `Select` over a closed list, typed to the list it was given. */
function Picker<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (value: T) => void
}) {
  return (
    <>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <Select
        value={value}
        onValueChange={(next) => onChange(next as T)}
        items={options.map(([option, text]) => ({
          value: option,
          label: text,
        }))}
      >
        <SelectTrigger id={id} size="sm" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([option, text]) => (
            <SelectItem key={option} value={option}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}
