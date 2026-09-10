'use client'

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
import type { TaskGrouping, TaskScope } from '../../../lib/tasks/query'
import { LoadMore } from '../../molecules/load-more'
import {
  TASK_COLUMNS,
  type TaskCellContext,
  type TaskColumnId,
} from './columns'
import { groupTasks } from './grouping'

/**
 * A list of tasks: the columns it was told to draw, grouped how it was told,
 * with a cursor it can spend for more.
 *
 * It is a client component for one reason — pressing Load more must add rows
 * to what is on screen rather than replace the screen — and it keeps its
 * server-rendered first page as the starting state instead of fetching it
 * again on mount.
 *
 * ⚠️ **Remount it when the query changes.** The accumulated rows are state,
 * and state survives a server re-render, so a new filter would otherwise
 * append its results to the old ones. The page gives it `key={search}`; that
 * is load-bearing, not decoration.
 */
export function TaskList({
  initialRows,
  initialCursor,
  initialLookups,
  scope,
  columns,
  grouping,
  search,
}: {
  initialRows: TaskRow[]
  initialCursor: string | null
  initialLookups: TaskLookups
  /** Which list this is — it decides where the next page comes from. */
  scope: TaskScope
  /** Ids into `TASK_COLUMNS`. Phase 4 hands these down from a saved view. */
  columns: TaskColumnId[]
  grouping: TaskGrouping
  /** The query string this list is showing, replayed to fetch the next page. */
  search: string
}) {
  const [rows, setRows] = useState(initialRows)
  const [cursor, setCursor] = useState(initialCursor)
  const [lookups, setLookups] = useState(initialLookups)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const drawn = columns.map((id) => TASK_COLUMNS[id])

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
    <div className="bg-paper-elevation-0 border-divider rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {drawn.map((column) => (
              <TableHead
                key={column.id}
                className={`table-header text-text-secondary ${column.className ?? ''}`}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
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
        <p
          className="text-error-main body-3 px-4 pt-2 text-center"
          role="alert"
        >
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
