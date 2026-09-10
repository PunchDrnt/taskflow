import { AUTH_ERROR_CODES, type TaskRow } from '@repo/shared'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@repo/ui/components/empty'

import { TaskList } from '../../../components/organisms/task-list'
import { DEFAULT_TASK_COLUMNS } from '../../../components/organisms/task-list/columns'
import { TaskToolbar } from '../../../components/organisms/task-toolbar'
import { ApiError } from '../../../lib/api/errors'
import { apiForRender } from '../../../lib/api/server'
import {
  fetchMyTasks,
  lookupsFor,
  type TaskLookups,
} from '../../../lib/api/tasks'
import {
  parseMyTasksQuery,
  toURLSearchParams,
  type MyTasksQueryState,
} from '../../../lib/tasks/query'

/**
 * My Tasks — what is assigned to me in **this** organisation.
 *
 * The counterpart to Home, and the difference between them is the whole reason
 * both exist: Home crosses organisations because it answers a question about
 * the person, and this one obeys the switcher because it answers a question
 * about a company. `GET /v1/tasks` is org-scoped by the guard, so the split is
 * enforced by the endpoint rather than remembered by the screen.
 *
 * Phase 1 means assigned *directly*: there is no team assignment yet, and the
 * column and its CHECK already hold both, so adding teams later changes this
 * screen not at all.
 */
export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const search = toURLSearchParams(await searchParams)
  const query = parseMyTasksQuery(search)
  const result = await firstPage(query)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header>
        <h1 className="h6">My Tasks</h1>
        <p className="text-text-secondary body-2 mt-1">
          Everything assigned to you in this organisation. Closed work is hidden
          unless you ask for it.
        </p>
      </header>

      {result.ok ? (
        <>
          <TaskToolbar query={query} />

          {/* ⚠️ `key` remounts the list when the query changes. The rows it has
              loaded are state, and state outlives a server re-render — without
              this, a new filter appends its results to the old ones. */}
          <TaskList
            key={search.toString()}
            initialRows={result.rows}
            initialCursor={result.nextCursor}
            initialLookups={result.lookups}
            columns={DEFAULT_TASK_COLUMNS}
            grouping={query.group}
            search={search.toString()}
          />
        </>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{result.title}</EmptyTitle>
            <EmptyDescription>{result.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}

type FirstPage =
  | {
      ok: true
      rows: TaskRow[]
      nextCursor: string | null
      lookups: TaskLookups
    }
  | { ok: false; title: string; description: string }

/**
 * The first page, or the reason there cannot be one.
 *
 * Two refusals are ordinary states rather than errors, and they need different
 * screens: somebody in several organisations who has not picked one has a
 * switcher above this page and needs to be told to use it, while somebody in
 * none has nothing to pick and is waiting on an invitation. One message for
 * both would send a person with three companies to a create-your-first page.
 *
 * Anything else is rethrown. `apiForRender` cannot refresh — a 401 here means
 * `proxy.ts` already tried — so an unexpected failure belongs to the error
 * boundary, not to a friendly box that hides it.
 */
async function firstPage(query: MyTasksQueryState): Promise<FirstPage> {
  try {
    const api = await apiForRender()
    const page = await fetchMyTasks(api, query)

    return {
      ok: true,
      rows: page.data,
      nextCursor: page.meta.nextCursor,
      lookups: await lookupsFor(api, page.data),
    }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error

    if (error.code === AUTH_ERROR_CODES.ORG_NOT_SELECTED) {
      return {
        ok: false,
        title: 'Pick an organisation',
        description:
          'You are in more than one. Choose which at the top of the sidebar, and this list follows it.',
      }
    }

    if (error.code === AUTH_ERROR_CODES.NO_ORGANIZATION) {
      return {
        ok: false,
        title: 'No organisation yet',
        description:
          'Tasks live inside an organisation. Once somebody adds you to one, your work shows up here.',
      }
    }

    throw error
  }
}
