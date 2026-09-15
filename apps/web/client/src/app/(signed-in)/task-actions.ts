'use server'

import { idSchema, updateTaskSchema, type TaskRow } from '@repo/shared'

import { ApiError, toApiError } from '../../lib/api/errors'
import { apiForAction } from '../../lib/api/server'
import { fetchTaskDetail, fetchTasks, lookupsFor } from '../../lib/api/tasks'
import type { MoreTasks } from '../../lib/tasks/more-tasks'
import { parseTaskQuery, type TaskScope } from '../../lib/tasks/query'
import type {
  TaskDetailOutcome,
  TaskEditOutcome,
  TaskPatch,
} from '../../lib/tasks/task-detail'

/**
 * The page after `cursor`, for the list the screen is already showing.
 *
 * The **query string** is the parameter, not a parsed state object, and that
 * is what makes this safe to expose: it goes back through `parseTaskQuery`,
 * the same function the page used, so a client that edits the object it was
 * handed gets exactly what a client that edits the URL gets — a filter changed
 * on their own list.
 *
 * The scope is not a way in either. `/tasks` means "assigned to me" and the
 * guard supplies the organisation; a project id is checked to be a uuid here
 * and checked for access by the API, which answers 404 rather than 403 for a
 * project the caller cannot see — a 403 would confirm the id exists.
 *
 * `apiForAction`, not `apiForRender`: an action can write cookies, so a token
 * that expired between two pages is renewed rather than ending the session.
 */
export async function loadMoreTasks(
  scope: TaskScope,
  search: string,
  cursor: string,
): Promise<MoreTasks> {
  if (
    scope.kind === 'project' &&
    !idSchema('Invalid project id').safeParse(scope.projectId).success
  ) {
    return { ok: false, message: 'Could not load more tasks.' }
  }

  const query = parseTaskQuery(new URLSearchParams(search), scope)

  try {
    const api = await apiForAction()
    const page = await fetchTasks(api, scope, query, cursor)

    return {
      ok: true,
      rows: page.data,
      nextCursor: page.meta.nextCursor,
      lookups: await lookupsFor(api, page.data),
    }
  } catch (error) {
    if (error instanceof ApiError && error.isNetworkFailure) {
      return { ok: false, message: 'Could not reach the server. Try again.' }
    }

    return { ok: false, message: 'Could not load more tasks.' }
  }
}

/**
 * Everything the detail drawer draws, for one task.
 *
 * Here rather than on the page because opening the drawer must not re-render
 * the list behind it: the rows Load more has added live in that component's
 * state, and a server round trip through the router would hand it a fresh
 * first page and drop them. The drawer therefore asks for its own data, from
 * the click that opens it.
 *
 * A **deep link is the exception** and is served by the page instead — see
 * `initialDetail` on `TaskList`. There is no click to fetch from when the URL
 * arrives already pointing at a task, and doing it on mount would mean
 * `setState` from an effect.
 *
 * The id is the only parameter, and it is checked for shape here and for
 * access by the API, which answers 404 for a task in a project the caller
 * cannot see rather than 403 — a 403 would confirm the task exists.
 */
export async function loadTaskDetail(
  taskId: string,
): Promise<TaskDetailOutcome> {
  if (!idSchema('Invalid task id').safeParse(taskId).success) {
    return { ok: false, message: 'That task does not exist.' }
  }

  try {
    const api = await apiForAction()

    return { ok: true, detail: await fetchTaskDetail(api, taskId) }
  } catch (error) {
    if (error instanceof ApiError && error.isNetworkFailure) {
      return { ok: false, message: 'Could not reach the server. Try again.' }
    }

    return { ok: false, message: toApiError(error).message }
  }
}

/**
 * One field of one task, changed from the drawer.
 *
 * Not `revalidatePath`, for the reason `changeTaskStatus` gives: the server is
 * deciding nothing the screen cannot see, and re-rendering the list would cost
 * the scroll position of a list somebody is working down. The whole task comes
 * back because the API does more than it was asked — a status that counts as
 * done stamps `completedAt` and `completedBy`, and leaving one clears them.
 *
 * ⚠️ **The patch goes on the wire as it arrived, not as zod returned it.**
 * `dueDateSchema` parses the string into a `Date`, and `JSON.stringify` sends a
 * `Date` as UTC `Z` — the same instant, but no longer the offset the browser
 * meant, which makes what the API stores impossible to read back against what
 * was sent. Validating and forwarding are two jobs, and only the first needs
 * the transform.
 */
export async function editTask(
  taskId: string,
  patch: TaskPatch,
): Promise<TaskEditOutcome> {
  const parsed = updateTaskSchema.safeParse(patch)

  if (
    !parsed.success ||
    !idSchema('Invalid task id').safeParse(taskId).success
  ) {
    return {
      ok: false,
      message: parsed.success
        ? 'That task does not exist.'
        : (parsed.error.issues[0]?.message ?? 'Could not save that change.'),
    }
  }

  // `parsed.data` for the stripping — an unknown field a caller added never
  // reaches the API — with the due date put back the way it came in.
  const body = {
    ...parsed.data,
    ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
  }

  try {
    const api = await apiForAction()
    const { data } = await api.patch<TaskRow>(`/tasks/${taskId}`, body)

    return { ok: true, task: data }
  } catch (error) {
    return { ok: false, message: toApiError(error).message }
  }
}
