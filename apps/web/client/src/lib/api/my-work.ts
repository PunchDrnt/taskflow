import type { MyWorkRow, Page } from '@repo/shared'

import { apiForRender } from './server'

/**
 * How many rows Home asks for, and therefore how far its counts are exact.
 *
 * `MAX_PAGE_SIZE` in `@repo/shared`. A hundred open, dated tasks on one person
 * is already a bad week for a twenty-person company, and paging Home to count
 * past it would trade a round trip for a number nobody reads differently. Past
 * the cap the screen says `100+` rather than guessing.
 */
const HOME_LIMIT = 100

export interface DueWork {
  rows: MyWorkRow[]
  /** True when there were more than `HOME_LIMIT`, so counts read as "n+". */
  capped: boolean
}

/**
 * Everything open and assigned to the caller, across every organisation,
 * soonest deadline first.
 *
 * One request rather than three. The alternative — a query per bucket
 * (overdue, this week, later) — needs three round trips to answer a question
 * one ordered page already contains, and `GET /v1/me/tasks` has no total to
 * make the counts cheaper anyway: `toPage` fetches one probe row instead of
 * running `COUNT(*)` over the same filters.
 *
 * Undated tasks sort last: the API orders on `COALESCE(due_date, 'infinity')`,
 * which is also what keeps the cursor working at all.
 */
export async function dueWork(): Promise<DueWork> {
  const api = await apiForRender()
  const { data } = await api.get<Page<MyWorkRow>>('/me/tasks', {
    params: { sort: 'dueDate', dir: 'asc', limit: HOME_LIMIT },
  })

  return { rows: data.data, capped: data.meta.hasMore }
}
