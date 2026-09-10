import {
  DEFAULT_PAGE_SIZE,
  TASK_PRIORITIES,
  TASK_SORT_FIELDS,
  type TaskPriority,
  type TaskSortField,
} from '@repo/shared'

/**
 * The whole state of a task list, as it lives in the URL.
 *
 * In the query string and nowhere else, which docs/04-features/phase-1.md asks
 * for by consequence rather than by mechanism: a filtered list has to be
 * shareable as a link, and a link is all this repo has until Phase 4 gives
 * views a table to live in. It also means the back button works on a filter
 * change, which no amount of component state gets right for free.
 *
 * One shape serves both lists, and `TaskScope` is what they differ by — the
 * alternative was two near-identical modules whose drift nobody would notice
 * until a control worked on one screen and not the other.
 */

/**
 * Which list this is: everything assigned to me, or everything in one project.
 *
 * They are different endpoints with different defaults and different sensible
 * controls, and three of the differences below are not cosmetic:
 *
 * - **`order` means nothing across projects.** A task's `sort_order` is a
 *   fractional index scoped to one column of one project, so comparing it
 *   between projects interleaves unrelated lists in an order that is stable,
 *   arbitrary and meaningless. It stays *accepted* by the API — the cursor
 *   pages it correctly — it is simply never an answer.
 * - **`includeClosed` belongs only to My Tasks.** A project's Done column is
 *   part of the board; hiding it there would hide a status the person made.
 * - **Grouping by project inside one project** is one heading over everything.
 */
export type TaskScope =
  { kind: 'mine' } | { kind: 'project'; projectId: string }

/**
 * How many rows one request brings back, and therefore what Load more loads.
 *
 * The API's own default, named here so the button's meaning does not change
 * silently if that default moves.
 */
export const TASK_PAGE_SIZE = DEFAULT_PAGE_SIZE

export const SORT_LABELS: Record<TaskSortField, string> = {
  order: 'Board order',
  dueDate: 'Due date',
  priority: 'Priority',
  created: 'Created',
  title: 'Title',
}

export function sortsFor(scope: TaskScope): readonly TaskSortField[] {
  return scope.kind === 'project'
    ? TASK_SORT_FIELDS
    : TASK_SORT_FIELDS.filter((sort) => sort !== 'order')
}

/**
 * How the loaded rows are piled up, decided in the browser.
 *
 * ⚠️ **Grouping sees only what is loaded.** It runs over the rows in hand, so
 * a group's count is "how many of these are here" and not "how many exist" —
 * pressing Load more can grow any group. That is the honest consequence of
 * grouping on the client, which the spec asks for because the alternative is
 * an endpoint per grouping; the counts are labelled as loaded rather than
 * dressed up as totals.
 */
export const TASK_GROUPINGS = [
  'none',
  'status',
  'priority',
  'project',
  'due',
] as const

export type TaskGrouping = (typeof TASK_GROUPINGS)[number]

export const GROUPING_LABELS: Record<TaskGrouping, string> = {
  none: 'Nothing',
  status: 'Status',
  priority: 'Priority',
  project: 'Project',
  due: 'Due date',
}

export function groupingsFor(scope: TaskScope): readonly TaskGrouping[] {
  return scope.kind === 'project'
    ? TASK_GROUPINGS.filter((grouping) => grouping !== 'project')
    : TASK_GROUPINGS
}

export interface TaskListQueryState {
  /** Matched against the title, case-insensitively. Empty means no search. */
  q: string
  /** Several values is "is in", never "and" — the API's only disjunction. */
  priority: TaskPriority[]
  sort: TaskSortField
  dir: 'asc' | 'desc'
  /** My Tasks only. False hides every status whose kind is done or cancelled. */
  includeClosed: boolean
  group: TaskGrouping
}

/**
 * What a list shows before anybody touches a control.
 *
 * My Tasks opens on the soonest deadline with closed work hidden — it should
 * answer "what is there to do", and a list that opens on a pile of finished
 * work is one people stop opening. A project opens in board order, because
 * that is the order somebody dragged it into.
 */
export function defaultQueryFor(scope: TaskScope): TaskListQueryState {
  return {
    q: '',
    priority: [],
    sort: scope.kind === 'project' ? 'order' : 'dueDate',
    dir: 'asc',
    includeClosed: false,
    group: 'none',
  }
}

/** Next hands `searchParams` as an object; everything here wants the real thing. */
export function toURLSearchParams(
  params: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    for (const one of Array.isArray(value) ? value : [value]) {
      search.append(key, one)
    }
  }

  return search
}

/**
 * The URL, read as state. Anything unrecognised falls back to the default.
 *
 * Lenient on purpose: these values arrive from a link somebody pasted, and a
 * typo in one parameter should cost that parameter rather than the page. The
 * API validates its own input regardless, so being generous here never widens
 * what can actually be asked for.
 */
export function parseTaskQuery(
  search: URLSearchParams,
  scope: TaskScope,
): TaskListQueryState {
  const fallback = defaultQueryFor(scope)
  const sort = search.get('sort')
  const dir = search.get('dir')
  const group = search.get('group')

  return {
    q: search.get('q')?.trim() ?? fallback.q,
    priority: search
      .getAll('priority')
      .filter((value): value is TaskPriority =>
        (TASK_PRIORITIES as readonly string[]).includes(value),
      ),
    sort: isOneOf(sort, sortsFor(scope)) ? sort : fallback.sort,
    dir: dir === 'desc' ? 'desc' : 'asc',
    includeClosed:
      scope.kind === 'project' ? false : search.get('includeClosed') === 'true',
    group: isOneOf(group, groupingsFor(scope)) ? group : fallback.group,
  }
}

/**
 * State back into a URL, with defaults left out.
 *
 * Omitting them keeps the shared link short and, more usefully, keeps it
 * meaning what it said: a link that spells out today's defaults would still
 * mean those values after the defaults change, which is not what the person
 * who copied it intended.
 */
export function toSearchParams(
  state: TaskListQueryState,
  scope: TaskScope,
): URLSearchParams {
  const fallback = defaultQueryFor(scope)
  const search = new URLSearchParams()

  if (state.q !== '') search.set('q', state.q)
  for (const priority of state.priority) search.append('priority', priority)
  if (state.sort !== fallback.sort) search.set('sort', state.sort)
  if (state.dir !== fallback.dir) search.set('dir', state.dir)
  if (state.includeClosed && scope.kind === 'mine') {
    search.set('includeClosed', 'true')
  }
  if (state.group !== fallback.group) search.set('group', state.group)

  return search
}

/**
 * What actually goes on the wire.
 *
 * A `URLSearchParams` rather than an object handed to axios, because one
 * parameter here repeats. Axios serialises `{ priority: ['high','urgent'] }`
 * as `priority[]=high&priority[]=urgent`, and whether the API reads that back
 * as an array depends on which query parser Express is configured with —
 * Express 5 defaults to the simple one, which would deliver a key literally
 * named `priority[]` and no `priority` at all. `?priority=high&priority=urgent`
 * is what `many()` in the task schema is written for, and it needs no parser
 * to agree with it.
 *
 * `group` is absent because grouping is a client-side rearrangement of rows
 * the server already sent — sending it would invite an endpoint that groups,
 * which is the thing the spec decided against. `includeClosed` is absent for a
 * project, whose endpoint has no such parameter.
 */
export function toApiParams(
  state: TaskListQueryState,
  scope: TaskScope,
  cursor: string | null,
): URLSearchParams {
  const params = new URLSearchParams({
    sort: state.sort,
    dir: state.dir,
    limit: String(TASK_PAGE_SIZE),
  })

  if (scope.kind === 'mine') {
    params.set('includeClosed', String(state.includeClosed))
  }

  if (state.q !== '') params.set('q', state.q)
  for (const priority of state.priority) params.append('priority', priority)
  if (cursor !== null) params.set('cursor', cursor)

  return params
}

function isOneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
): value is T {
  return value !== null && (allowed as readonly string[]).includes(value)
}
