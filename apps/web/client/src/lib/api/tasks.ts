import type { AxiosInstance } from 'axios'

import type { Page, ProjectRow, StatusRow, TaskRow } from '@repo/shared'

import { toApiParams, type MyTasksQueryState } from '../tasks/query'
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

export const EMPTY_LOOKUPS: TaskLookups = { projects: {}, statuses: {} }

/** One page of the caller's own work, inside the active organisation. */
export async function fetchMyTasks(
  api: AxiosInstance,
  query: MyTasksQueryState,
  cursor: string | null = null,
): Promise<Page<TaskRow>> {
  const { data } = await api.get<Page<TaskRow>>(
    `/tasks?${toApiParams(query, cursor)}`,
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
