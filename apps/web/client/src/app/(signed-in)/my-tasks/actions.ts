'use server'

import { ApiError } from '../../../lib/api/errors'
import { apiForAction } from '../../../lib/api/server'
import { fetchMyTasks, lookupsFor } from '../../../lib/api/tasks'
import type { MoreTasks } from '../../../lib/tasks/more-tasks'
import { parseMyTasksQuery } from '../../../lib/tasks/query'

/**
 * The page after `cursor`, for the same query the screen is already showing.
 *
 * The **query string** is the parameter, not a parsed state object, and that
 * is what makes this safe to expose: it goes back through `parseMyTasksQuery`,
 * the same function the page used, so a client that edits the object it was
 * handed gets exactly what a client that edits the URL gets — a filter changed
 * on their own list. Scope is not in this parameter at all: `GET /v1/tasks`
 * means "assigned to me" and the guard supplies the organisation, so there is
 * nothing here to widen.
 *
 * `apiForAction`, not `apiForRender`: an action can write cookies, so a token
 * that expired between two pages is renewed rather than ending the session.
 */
export async function loadMoreMyTasks(
  search: string,
  cursor: string,
): Promise<MoreTasks> {
  const query = parseMyTasksQuery(new URLSearchParams(search))

  try {
    const api = await apiForAction()
    const page = await fetchMyTasks(api, query, cursor)

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
