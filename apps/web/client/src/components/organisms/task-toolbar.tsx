'use client'

import { ArrowDown, ArrowUp, ListFilter } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { TASK_PRIORITIES, type TaskPriority } from '@repo/shared'
import { Button } from '@repo/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu'
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
  MY_TASKS_SORTS,
  SORT_LABELS,
  TASK_GROUPINGS,
  toSearchParams,
  type MyTasksQueryState,
} from '../../lib/tasks/query'

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
 * ⚠️ `DropdownMenuLabel` is Base UI's `Menu.GroupLabel` and throws outside a
 * `Menu.Group` — hence the `DropdownMenuGroup` around the priorities rather
 * than a bare label with items after it.
 */
export function TaskToolbar({ query }: { query: MyTasksQueryState }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState(query.q)

  function go(patch: Partial<MyTasksQueryState>) {
    const next = toSearchParams({ ...query, ...patch }).toString()

    startTransition(() => {
      router.push(next === '' ? pathname : `${pathname}?${next}`)
    })
  }

  function togglePriority(priority: TaskPriority, wanted: boolean) {
    go({
      priority: wanted
        ? [...query.priority, priority]
        : query.priority.filter((held) => held !== priority),
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

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" color="primary" size="sm">
              <ListFilter />
              Priority
              {query.priority.length > 0 && (
                <span className="tabular-nums">({query.priority.length})</span>
              )}
            </Button>
          }
        />
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Priority</DropdownMenuLabel>
            {TASK_PRIORITIES.map((priority) => (
              <DropdownMenuCheckboxItem
                key={priority}
                closeOnClick={false}
                checked={query.priority.includes(priority)}
                onCheckedChange={(wanted) => togglePriority(priority, wanted)}
              >
                {priority}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Picker
        id="task-sort"
        label="Sort by"
        value={query.sort}
        options={MY_TASKS_SORTS.map((sort) => [sort, SORT_LABELS[sort]])}
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
        options={TASK_GROUPINGS.map((group) => [group, GROUPING_LABELS[group]])}
        onChange={(group) => go({ group })}
      />

      <label className="text-text-secondary body-3 flex items-center gap-2">
        <Switch
          checked={query.includeClosed}
          onCheckedChange={(includeClosed) => go({ includeClosed })}
        />
        Show closed
      </label>
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
  options: [T, string][]
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
