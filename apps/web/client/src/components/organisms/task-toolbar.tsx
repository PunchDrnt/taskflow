'use client'

import { ArrowDownUp, Group as GroupIcon, Search } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import type { AssignableRow, StatusRow, TaskSortField } from '@repo/shared'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@repo/ui/components/input-group'
import { Switch } from '@repo/ui/components/switch'

import {
  defaultQueryFor,
  GROUPING_LABELS,
  groupingsFor,
  SORT_LABELS,
  sortsFor,
  toSearchParams,
  type TaskGrouping,
  type TaskListQueryState,
  type TaskScope,
} from '../../lib/tasks/query'
import { ToolbarChip } from '../atoms/toolbar-chip'
import { TaskFilters } from './task-filters'

/**
 * The controls above a task list, every one of which writes to the URL.
 *
 * No state is held here beyond the search box's unsent keystrokes. Changing a
 * control navigates, the server re-renders with the new query, and the list
 * below adopts it — which is what makes a filtered list a link somebody can
 * send, and what makes the back button undo a filter.
 *
 * The search box is the exception, and only until Enter: pushing a URL per
 * keystroke would put a history entry behind every letter and ask the API for
 * a page nobody waited to see.
 *
 * **Filter, Sort and Group sit together at the left, in that order**, because
 * they read as one sentence about the list and are reached in that order: what
 * is on screen, then how it is ordered, then how it is divided. The search box
 * is pushed to the far right — it asks a different question, and putting it
 * first pushed the three controls into the corner nobody looks in.
 *
 * Sort and Group are `DropdownMenu`s rather than popovers holding hand-written
 * buttons: each is one value chosen from a list, which is what
 * `DropdownMenuRadioGroup` *is* — and it brings the roving focus, the typeahead
 * and `aria-checked` with it, none of which a `<button>` in a popover has.
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

  // A chip is lit when it is doing something, and a list's own opening order
  // is not something anybody chose — so Sort stays dark until it differs.
  const fallback = defaultQueryFor(scope)
  const sorted = query.sort !== fallback.sort || query.dir !== fallback.dir

  return (
    <div className="flex flex-wrap items-center gap-1" data-pending={pending}>
      <TaskFilters
        query={query}
        scope={scope}
        statuses={statuses}
        people={people}
        onChange={go}
      />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <ToolbarChip
              icon={<ArrowDownUp />}
              label="Sort"
              value={
                sorted
                  ? `${SORT_LABELS[query.sort]} ${query.dir === 'asc' ? '↑' : '↓'}`
                  : null
              }
            />
          }
        />

        <DropdownMenuContent className="w-52">
          <DropdownMenuRadioGroup
            value={query.sort}
            onValueChange={(sort) => go({ sort: sort as TaskSortField })}
          >
            {/* Inside the group, not above it: `DropdownMenuLabel` is Base UI's
                `GroupLabel`, which reads the group's context to point
                `aria-labelledby` at itself and throws when there is none. */}
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            {sortsFor(scope).map((sort) => (
              <DropdownMenuRadioItem key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          <DropdownMenuRadioGroup
            value={query.dir}
            onValueChange={(dir) => go({ dir: dir as 'asc' | 'desc' })}
          >
            <DropdownMenuRadioItem value="asc">Ascending</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="desc">
              Descending
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <ToolbarChip
              icon={<GroupIcon />}
              label="Group"
              value={
                query.group === 'none' ? null : GROUPING_LABELS[query.group]
              }
            />
          }
        />

        <DropdownMenuContent className="w-52">
          <DropdownMenuRadioGroup
            value={query.group}
            onValueChange={(group) => go({ group: group as TaskGrouping })}
          >
            <DropdownMenuLabel>Group by</DropdownMenuLabel>
            {groupingsFor(scope).map((group) => (
              <DropdownMenuRadioItem key={group} value={group}>
                {GROUPING_LABELS[group]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Only My Tasks hides closed work. A project's Done column is part of
          its board — hiding it there would hide a status somebody made. */}
      {scope.kind === 'mine' && (
        <label className="text-text-secondary body-2 ml-2 flex items-center gap-2">
          <Switch
            checked={query.includeClosed}
            onCheckedChange={(includeClosed) => go({ includeClosed })}
          />
          Show closed
        </label>
      )}

      <form
        className="ml-auto w-56"
        onSubmit={(event) => {
          event.preventDefault()
          go({ q: draft.trim() })
        }}
      >
        <InputGroup>
          <InputGroupAddon>
            <Search className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search titles"
            placeholder="Search titles"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </InputGroup>
      </form>
    </div>
  )
}
