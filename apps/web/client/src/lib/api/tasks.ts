import type { AxiosInstance } from 'axios'

import {
  idSchema,
  type ActivityRow,
  type Page,
  type ProjectRow,
  type StatusRow,
  type TaskRow,
} from '@repo/shared'

import {
  toApiParams,
  type TaskListQueryState,
  type TaskScope,
} from '@/lib/tasks/query'
import type { TaskDetail } from '@/lib/tasks/task-detail'

import { ApiError } from './errors'
import { fetchProjects, projectById } from './projects'
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

  return lookupsOf(projects, statuses.flat())
}

/**
 * The same map, out of rows the caller already has.
 *
 * A screen inside one project has fetched that project and its statuses to
 * draw its own header and filters, and `lookupsFor` would fetch both a second
 * time — plus the whole project list, for a column that screen does not show.
 * Indexing is the part worth sharing; fetching is not.
 */
export function lookupsOf(
  projects: ProjectRow[],
  statuses: StatusRow[],
): TaskLookups {
  return { projects: byId(projects), statuses: byId(statuses) }
}

function byId<T extends { id: string }>(rows: T[]): Record<string, T> {
  return Object.fromEntries(rows.map((row) => [row.id, row]))
}

/** One task by id — the same shape a list row is, because it is one. */
export async function fetchTask(
  api: AxiosInstance,
  taskId: string,
): Promise<TaskRow> {
  const { data } = await api.get<TaskRow>(`/tasks/${taskId}`)

  return data
}

/**
 * What has happened to one task, newest first.
 *
 * Wrapped like every other list even though it does not page — see
 * `wholeList()` in `@repo/shared` for why the envelope is unconditional.
 */
export async function fetchTaskActivity(
  api: AxiosInstance,
  taskId: string,
): Promise<ActivityRow[]> {
  const { data } = await api.get<Page<ActivityRow>>(`/tasks/${taskId}/activity`)

  return data.data
}

/**
 * Everything the detail drawer needs, in one round of requests.
 *
 * The task first, because the other three depend on it: two of them need the
 * project it is in, and asking for them before knowing that would mean
 * fetching a board the task might not be on. The rest go out together.
 *
 * The statuses are fetched even on a screen that already has some. A cross-
 * project list holds a flat map of every loaded project's columns with nothing
 * on a `StatusRow` saying which project it came from, so there is no filtering
 * this could do instead — see `TaskDetail`.
 */
export async function fetchTaskDetail(
  api: AxiosInstance,
  taskId: string,
): Promise<TaskDetail> {
  const task = await fetchTask(api, taskId)

  const [project, statuses, activity] = await Promise.all([
    projectById(api, task.projectId),
    fetchStatuses(api, task.projectId),
    fetchTaskActivity(api, taskId),
  ])

  return { task, project, statuses, activity }
}

/**
 * The task a `?task=` parameter names, for a page that has to render with the
 * drawer already open.
 *
 * Null covers all three ways there is nothing to open: no parameter, a
 * parameter that is not an id, and an id the API will not answer for. The last
 * one is the interesting case — a link pasted into chat months ago, pointing at
 * a task since deleted, or at a project the reader has been removed from — and
 * the right answer to it is the list, not an error page. The rest of the screen
 * is perfectly good.
 */
export async function detailFor(
  api: AxiosInstance,
  taskId: string | null,
): Promise<TaskDetail | null> {
  if (taskId === null || !idSchema('Invalid task id').safeParse(taskId).success)
    return null

  try {
    return await fetchTaskDetail(api, taskId)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null

    throw error
  }
}
