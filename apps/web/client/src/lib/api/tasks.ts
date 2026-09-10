import type { AxiosInstance } from 'axios'

import type { Page, ProjectRow, StatusRow, TaskRow } from '@repo/shared'

import {
  toApiParams,
  type TaskListQueryState,
  type TaskScope,
} from '../tasks/query'
import { fetchProjects } from './projects'
import { fetchStatuses } from './statuses'

/**
 * The names a task row cannot carry itself.
 *
 * A task holds a `projectId` and a `statusId` and nothing else about either,
 * which is right — those are other people's rows and duplicating their names
 * onto every task is how a rename stops taking effect. So a list that wants to
 * show them looks them up, once per page, rather than asking the API to
 * denormalise on its behalf.
 *
 * Plain objects rather than `Map`s: this crosses to a client component as a
 * prop and comes back out of a Server Action, and a `Record` survives that
 * boundary in every direction without depending on what the serialiser
 * happens to support this release.
 */
export interface TaskLookups {
  projects: Record<string, ProjectRow>
  statuses: Record<string, StatusRow>
}

const EMPTY_LOOKUPS: TaskLookups = { projects: {}, statuses: {} }

/**
 * One page of a task list — the caller's own work, or one project's.
 *
 * Two endpoints behind one function because the difference is genuinely the
 * path: `/tasks` is "assigned to me in this organisation" and
 * `/projects/:id/tasks` is "everything on this board". Both answer the same
 * `Page<TaskRow>` with the same cursor, and the query is built from the same
 * state, so a caller that had to pick between two functions would be picking
 * on the one axis that is already a parameter.
 */
export async function fetchTasks(
  api: AxiosInstance,
  scope: TaskScope,
  query: TaskListQueryState,
  cursor: string | null = null,
): Promise<Page<TaskRow>> {
  const path =
    scope.kind === 'project' ? `/projects/${scope.projectId}/tasks` : '/tasks'

  const { data } = await api.get<Page<TaskRow>>(
    `${path}?${toApiParams(query, scope, cursor)}`,
  )

  return data
}

/**
 * The projects and statuses named by one page of tasks.
 *
 * One request for the project list plus one per distinct project on the page —
 * a handful, because a page of fifty tasks assigned to one person rarely spans
 * more than a few. They go out together rather than in sequence, which is
 * exactly the case `apiForAction` was single-flighted for: parallel reads
 * against a token that expired between pages would otherwise send one refresh
 * each and lose all but the first.
 *
 * A project missing from the map is not an error — see `TaskListRow`, which
 * draws the key on its own. It happens the moment somebody is unassigned from
 * a project between the page load and Load more.
 */
export async function lookupsFor(
  api: AxiosInstance,
  rows: TaskRow[],
): Promise<TaskLookups> {
  if (rows.length === 0) return EMPTY_LOOKUPS

  const projectIds = [...new Set(rows.map((row) => row.projectId))]

  const [projects, statuses] = await Promise.all([
    fetchProjects(api),
    Promise.all(projectIds.map((id) => fetchStatuses(api, id))),
  ])

  return {
    projects: byId(projects),
    statuses: byId(statuses.flat()),
  }
}

function byId<T extends { id: string }>(rows: T[]): Record<string, T> {
  return Object.fromEntries(rows.map((row) => [row.id, row]))
}
