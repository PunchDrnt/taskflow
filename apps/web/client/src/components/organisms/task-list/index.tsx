'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { Fragment, useState, useTransition } from 'react'

import type { TaskRow } from '@repo/shared'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@repo/ui/components/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table'

import { loadMoreTasks } from '../../../app/(signed-in)/task-actions'
import type { TaskLookups } from '../../../lib/api/tasks'
import type { MoreTasks } from '../../../lib/tasks/more-tasks'
import {
  toSearchParams,
  type TaskGrouping,
  type TaskListQueryState,
  type TaskScope,
} from '../../../lib/tasks/query'
import { LoadMore } from '../../molecules/load-more'
import {
  TASK_COLUMNS,
  type TaskCellContext,
  type TaskColumn,
  type TaskColumnId,
} from './columns'
import { groupTasks } from './grouping'

/**
 * The card is drawn by the body's own cells, not by a wrapper around the table.
 *
 * The design puts the column headers *above* the card, and a border on a
 * wrapping `<div>` cannot express that — it encloses the `<thead>` too. The
 * separated border model lets the cells carry it instead: the outer edges of
 * the body become the card, the header sits outside with nothing drawn around
 * it, and there is still exactly one `<table>`, so the columns cannot drift
 * apart the way two tables sharing a `<colgroup>` eventually do.
 *
 * ⚠️ Row borders and row backgrounds are **ignored** in that model, which is
 * why the fill and the hover are on the cells rather than on `<tr>`.
 */
const BODY_AS_CARD = [
  '[&>tr>td]:bg-paper-elevation-0 [&>tr:hover>td]:bg-paper-elevation-1',
  '[&>tr>td]:border-divider [&>tr>td]:border-y [&>tr:not(:first-child)>td]:border-t-0',
  '[&>tr>td:first-child]:border-l [&>tr>td:last-child]:border-r',
  '[&>tr:first-child>td:first-child]:rounded-tl-lg',
  '[&>tr:first-child>td:last-child]:rounded-tr-lg',
  '[&>tr:last-child>td:first-child]:rounded-bl-lg',
  '[&>tr:last-child>td:last-child]:rounded-br-lg',
].join(' ')

/**
 * A list of tasks: the columns it was told to draw, grouped how it was told,
 * with a cursor it can spend for more.
 *
 * It is a client component for one reason — pressing Load more must add rows
 * to what is on screen rather than replace the screen — and it keeps its
 * server-rendered first page as the starting state instead of fetching it
 * again on mount.
 *
 * ⚠️ **When the server sends a different first page, what Load more
 * accumulated is dropped.** State outlives a server re-render, so without this
 * a new filter would have its results appended to the old ones — and a task
 * added by the box above this list would not appear at all, which is the case
 * that is easy to miss because nothing looks broken, it just does nothing.
 */
export function TaskList({
  initialRows,
  initialCursor,
  initialLookups,
  scope,
  columns,
  query,
  search,
}: {
  initialRows: TaskRow[]
  initialCursor: string | null
  initialLookups: TaskLookups
  /** Which list this is — it decides where the next page comes from. */
  scope: TaskScope
  /** Ids into `TASK_COLUMNS`. Phase 4 hands these down from a saved view. */
  columns: TaskColumnId[]
  /** What the URL currently asks for, so a header can change one part of it. */
  query: TaskListQueryState
  /** The query string this list is showing, replayed to fetch the next page. */
  search: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [rows, setRows] = useState(initialRows)
  const [cursor, setCursor] = useState(initialCursor)
  const [lookups, setLookups] = useState(initialLookups)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // The server's page is the authority, and this is React's own answer to
  // "reset state when a prop changes" — an assignment during render rather
  // than an effect, so the new rows are drawn in this pass instead of in a
  // second one that flashes the old ones first.
  const [rendered, setRendered] = useState(initialRows)

  if (rendered !== initialRows) {
    setRendered(initialRows)
    setRows(initialRows)
    setCursor(initialCursor)
    setLookups(initialLookups)
  }

  const grouping: TaskGrouping = query.group
  const drawn = columns.map((id) => TASK_COLUMNS[id])

  /**
   * Sorting by a header: the same field again flips the direction, a new one
   * starts ascending. That is what every table people have used does, and the
   * alternative — always ascending — makes "oldest first" a two-step.
   */
  function sortBy(column: TaskColumn) {
    if (column.sort === undefined) return

    const next = toSearchParams(
      {
        ...query,
        sort: column.sort,
        dir: query.sort === column.sort && query.dir === 'asc' ? 'desc' : 'asc',
      },
      scope,
    ).toString()

    startTransition(() => {
      router.push(next === '' ? pathname : `${pathname}?${next}`)
    })
  }

  const context: TaskCellContext = {
    scope,
    onTaskChanged: (changed) =>
      setRows((held) =>
        held.map((task) => (task.id === changed.id ? changed : task)),
      ),
  }

  function loadMore() {
    if (cursor === null) return

    setFailure(null)
    startTransition(async () => {
      apply(await loadMoreTasks(scope, search, cursor))
    })
  }

  function apply(result: MoreTasks) {
    if (!result.ok) {
      setFailure(result.message)

      return
    }

    setRows((held) => [...held, ...result.rows])
    setCursor(result.nextCursor)
    setLookups((held) => ({
      projects: { ...held.projects, ...result.lookups.projects },
      statuses: { ...held.statuses, ...result.lookups.statuses },
    }))
  }

  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Nothing here</EmptyTitle>
          <EmptyDescription>
            Work assigned to you shows up here. Closed tasks are hidden unless
            you ask for them.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Table className="border-separate border-spacing-0">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {drawn.map((column) => (
              <TableHead
                key={column.id}
                className={`overlined text-text-disabled h-8 font-normal ${column.className ?? ''}`}
                aria-sort={
                  column.sort === undefined || column.sort !== query.sort
                    ? undefined
                    : query.dir === 'asc'
                      ? 'ascending'
                      : 'descending'
                }
              >
                {column.sort === undefined ? (
                  column.header
                ) : (
                  <button
                    type="button"
                    // `uppercase` again: a <button> does not inherit
                    // `text-transform` from the <th> under the UA stylesheet,
                    // so the three sortable headers came out in title case
                    // beside four that were not.
                    className="hover:text-text-primary inline-flex items-center gap-1 uppercase"
                    onClick={() => sortBy(column)}
                  >
                    {column.header}
                    {column.sort === query.sort &&
                      (query.dir === 'asc' ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      ))}
                  </button>
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody className={BODY_AS_CARD}>
          {groupTasks(rows, grouping, lookups).map((group) => (
            <Fragment key={group.key}>
              {group.label !== '' && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={drawn.length}
                    // `list-subheader` is the design system's own class for
                    // exactly this: a label that divides a list rather than
                    // heading the page around it.
                    className="list-subheader text-text-secondary bg-action-hover"
                  >
                    {group.label}{' '}
                    <span className="tabular-nums">({group.rows.length})</span>
                  </TableCell>
                </TableRow>
              )}

              {group.rows.map((task) => (
                <TableRow key={task.id}>
                  {drawn.map((column) => (
                    <TableCell key={column.id} className={column.className}>
                      {column.cell(task, lookups, context)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>

      {failure !== null && (
        <p className="text-error-main body-3" role="alert">
          {failure}
        </p>
      )}

      <LoadMore
        loaded={rows.length}
        hasMore={cursor !== null}
        pending={pending}
        onLoadMore={loadMore}
      />
    </div>
  )
}
