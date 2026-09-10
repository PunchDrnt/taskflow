'use server'

import { idSchema } from '@repo/shared'

import { ApiError } from '../../lib/api/errors'
import { apiForAction } from '../../lib/api/server'
import { fetchTasks, lookupsFor } from '../../lib/api/tasks'
import type { MoreTasks } from '../../lib/tasks/more-tasks'
import { parseTaskQuery, type TaskScope } from '../../lib/tasks/query'

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
