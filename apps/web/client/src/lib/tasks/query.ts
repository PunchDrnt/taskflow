import {
  DEFAULT_PAGE_SIZE,
  MAX_SORT_RULES,
  TASK_PRIORITIES,
  TASK_SORT_FIELDS,
  type TaskPriority,
  type TaskSortField,
  type TaskSortRule,
} from '@repo/shared'

import { endOfDay, isCalendarDay, startOfDay } from '../format/due-date'

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
 *
 * Two filters are in the same position. `statusId` is an id belonging to one
 * project — two boards' "In progress" are two different rows — so it cannot
 * mean anything on a list that spans projects; and `assigneeId` on My Tasks is
 * always the caller. Both are offered on a project and nowhere else.
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
 * How many rules may be added, which is the API's ceiling and not a taste.
 * Each one is another branch in the cursor's keyset predicate.
 */
export const MAX_TASK_SORT_RULES = MAX_SORT_RULES

/** The rules that are still worth offering: a field sorts on once. */
export function unusedSortsFor(
  scope: TaskScope,
  rules: readonly TaskSortRule[],
  keep?: TaskSortField,
): readonly TaskSortField[] {
  const taken = new Set(rules.map((rule) => rule.field))

  return sortsFor(scope).filter((field) => field === keep || !taken.has(field))
}

/** Whether the list is in an order somebody chose, rather than its own. */
export function isSorted(state: TaskListQueryState, scope: TaskScope): boolean {
  const fallback = defaultQueryFor(scope).sort

  return (
    state.sort.length !== fallback.length ||
    state.sort.some(
      (rule, index) =>
        rule.field !== fallback[index]!.field ||
        rule.dir !== fallback[index]!.dir,
    )
  )
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
  /** Project lists only: statuses belong to one board. */
  statusId: string[]
  /** Project lists only: on My Tasks the assignee is always the caller. */
  assigneeId: string[]
  /**
   * `YYYY-MM-DD` in the company's zone, or empty. Both ends inclusive.
   *
   * A calendar day in the URL rather than an instant, because that is what the
   * person picked and what makes a shared link readable. The conversion to an
   * offset-bearing instant happens once, in `toApiParams`.
   */
  dueFrom: string
  dueTo: string
  /**
   * The ordering rules, in the order they apply — "urgent first, then the
   * nearest deadline" is two of them, and the list is what the API takes.
   *
   * Never empty. A list with no ordering cannot be paged by a cursor, since
   * there is no position to resume from, so "no sort" is the default rule
   * rather than an absence — see `defaultQueryFor`.
   */
  sort: TaskSortRule[]
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
    statusId: [],
    assigneeId: [],
    dueFrom: '',
    dueTo: '',
    sort: [
      { field: scope.kind === 'project' ? 'order' : 'dueDate', dir: 'asc' },
    ],
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
  const group = search.get('group')

  return {
    q: search.get('q')?.trim() ?? fallback.q,
    priority: search
      .getAll('priority')
      .filter((value): value is TaskPriority =>
        (TASK_PRIORITIES as readonly string[]).includes(value),
      ),
    // Dropped outright on My Tasks rather than passed through: a status id
    // from one project would filter a cross-project list down to that
    // project's rows, which is not what anybody pasting the link meant.
    statusId:
      scope.kind === 'project' ? search.getAll('statusId').filter(isId) : [],
    assigneeId:
      scope.kind === 'project' ? search.getAll('assigneeId').filter(isId) : [],
    dueFrom: day(search.get('dueFrom')),
    dueTo: day(search.get('dueTo')),
    sort: sortRules(search.getAll('sort'), scope, fallback.sort),
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
  for (const statusId of state.statusId) search.append('statusId', statusId)
  for (const userId of state.assigneeId) search.append('assigneeId', userId)
  if (state.dueFrom !== '') search.set('dueFrom', state.dueFrom)
  if (state.dueTo !== '') search.set('dueTo', state.dueTo)
  if (isSorted(state, scope)) {
    for (const rule of state.sort) {
      search.append('sort', `${rule.field}:${rule.dir}`)
    }
  }
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
  const params = new URLSearchParams({ limit: String(TASK_PAGE_SIZE) })

  // Repeated rather than comma-joined, in the order they apply — the shape
  // `taskSortRuleSchema` reads, and the one that needs no agreement about a
  // separator with whichever query parser Express is configured with.
  for (const rule of state.sort) {
    params.append('sort', `${rule.field}:${rule.dir}`)
  }

  if (scope.kind === 'mine') {
    params.set('includeClosed', String(state.includeClosed))
  }

  if (state.q !== '') params.set('q', state.q)
  for (const priority of state.priority) params.append('priority', priority)
  for (const statusId of state.statusId) params.append('statusId', statusId)
  for (const userId of state.assigneeId) params.append('assigneeId', userId)

  // 🔒 The day becomes an instant here and only here. `dueDateSchema` refuses
  // a date without an offset, because `2026-09-07` alone means midnight UTC —
  // seven hours before that day starts in Bangkok, so "due from the 7th" would
  // quietly include the evening of the 6th.
  if (state.dueFrom !== '') params.set('dueAfter', startOfDay(state.dueFrom))
  if (state.dueTo !== '') params.set('dueBefore', endOfDay(state.dueTo))

  if (cursor !== null) params.set('cursor', cursor)

  return params
}

/**
 * `sort=priority:desc&sort=title:asc` as rules, dropping anything unusable.
 *
 * Lenient in the same way the rest of this is: a rule naming a field this
 * scope does not offer, or a field already used, costs that rule rather than
 * the page. An empty result falls back to the default, because a list with no
 * ordering cannot be paged by a cursor.
 */
function sortRules(
  raw: string[],
  scope: TaskScope,
  fallback: TaskSortRule[],
): TaskSortRule[] {
  const allowed = sortsFor(scope)
  const rules: TaskSortRule[] = []

  for (const entry of raw.slice(0, MAX_TASK_SORT_RULES)) {
    const parts = entry.split(':')
    const field = parts[0] ?? ''

    if (!isOneOf(field, allowed)) continue
    if (rules.some((rule) => rule.field === field)) continue

    rules.push({ field, dir: parts[1] === 'desc' ? 'desc' : 'asc' })
  }

  return rules.length === 0 ? fallback : rules
}

/** A uuid, checked before it is put back in a URL or sent as a filter. */
function isId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  )
}

/** A real calendar day, or empty. `2026-02-31` is well-shaped and not a day. */
function day(value: string | null): string {
  return value !== null && isCalendarDay(value) ? value : ''
}

/** How many filters are on, for the button that opens them. */
export function activeFilterCount(state: TaskListQueryState): number {
  return (
    state.priority.length +
    state.statusId.length +
    state.assigneeId.length +
    (state.dueFrom === '' ? 0 : 1) +
    (state.dueTo === '' ? 0 : 1)
  )
}

/** Everything a filter control touches, cleared. Search and sort are not filters. */
export function clearedFilters(): Pick<
  TaskListQueryState,
  'priority' | 'statusId' | 'assigneeId' | 'dueFrom' | 'dueTo'
> {
  return { priority: [], statusId: [], assigneeId: [], dueFrom: '', dueTo: '' }
}

function isOneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
): value is T {
  return value !== null && (allowed as readonly string[]).includes(value)
}
