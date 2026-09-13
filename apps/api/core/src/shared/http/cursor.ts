import { type Page } from '@repo/shared'

import { ApiException } from './api-exception'

/**
 * Keyset pagination — the position in a list expressed as *the last row you
 * saw*, not as how many rows you skipped.
 *
 * 🔒 **Offset paging is wrong for every list in this system, not merely
 * slower.** `sort_order` is a fractional index: somebody dragging a card
 * inserts a key *between* two existing ones, so between page 1 and page 2 the
 * rows before your position change count. `OFFSET 50` then either repeats a
 * row or skips one, silently, and the person reading a task list never learns
 * that the work they were looking for was on neither page.
 * `OrgScopedRepository` removes `skip` from the find family for this reason,
 * so the mistake does not compile.
 *
 * A cursor here is **one value per ordering rule, then the id** — the last row
 * you saw, described in exactly the terms the list is ordered by. The id is
 * always last and always ascending, because it is the tiebreaker that makes
 * the order total: without it two rows sharing every sort value have no
 * defined position, and a page boundary landing between them repeats one or
 * drops one.
 *
 * Every ordering expression must be **NOT NULL**. A comparison against NULL is
 * NULL rather than true, so a nullable sort column silently returns an empty
 * page. See `TASK_SORTS`, where `due_date` becomes
 * `COALESCE(due_date, 'infinity')` and priority becomes a rank.
 *
 * The encoding is base64url of JSON — opaque on purpose. It is a position in
 * a result set, not an API: a client that parses one has coupled itself to
 * the ordering, and the day a sort gains a rule their paging breaks in a way
 * nobody can see from here.
 */
export interface Cursor {
  /** One per ordering rule, in the order the rules apply. */
  readonly values: readonly string[]
  readonly id: string
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(
    JSON.stringify([...cursor.values, cursor.id]),
    'utf8',
  ).toString('base64url')
}

/**
 * The position back out, or a 400.
 *
 * A malformed cursor is a bad request, never a 500: they arrive from URLs
 * people copy, edit and share, and half a pasted cursor must not page anybody.
 *
 * `rules` is how many ordering values this request expects, and checking it is
 * what makes a cursor from a *differently sorted* list a 400 rather than a
 * wrong answer. Changing the sort while holding a cursor is ordinary — the
 * toolbar does it — and the old position means nothing under the new order:
 * resuming from it would compare yesterday's due date against today's priority
 * rank and page from somewhere arbitrary. The client's answer to a 400 here is
 * to ask for the first page, which is what changing a sort means anyway.
 */
export function decodeCursor(raw: string, rules: number): Cursor {
  let parsed: unknown

  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  } catch {
    throw badCursor()
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length !== rules + 1 ||
    !parsed.every((part) => typeof part === 'string')
  ) {
    throw badCursor()
  }

  const parts = parsed as string[]

  return { values: parts.slice(0, rules), id: parts[rules]! }
}

/**
 * Turns `limit + 1` rows into a page.
 *
 * The extra row is how `hasMore` is answered without a second `COUNT(*)` over
 * the same filters — a count that would be a full scan on every keystroke of
 * a search box, to display something no screen here shows.
 */
export function toPage<Row, View>(
  rows: Row[],
  limit: number,
  cursorOf: (row: Row) => Cursor,
  view: (row: Row) => View,
): Page<View> {
  const hasMore = rows.length > limit
  const visible = hasMore ? rows.slice(0, limit) : rows
  const last = visible.at(-1)

  return {
    data: visible.map(view),
    meta: {
      nextCursor: hasMore && last ? encodeCursor(cursorOf(last)) : null,
      hasMore,
    },
  }
}

function badCursor(): ApiException {
  return ApiException.badRequest('Invalid cursor')
}
