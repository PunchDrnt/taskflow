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
 * A cursor here is `[sortValue, id]` — the ordering expression's value for the
 * last row, and its id to break ties. The query resumes with a row comparison
 * on exactly that pair, which is why every sort this module offers has a
 * **NOT NULL** ordering expression: `(a, b) > (NULL, c)` is NULL, not true, so
 * a nullable sort column would quietly return an empty page. See
 * `TASK_SORTS`, where `due_date` becomes `COALESCE(due_date, 'infinity')` and
 * priority becomes a rank.
 *
 * The encoding is base64url of JSON — opaque on purpose. It is a position in
 * a result set, not an API: a client that parses one has coupled itself to
 * the ordering, and the day a sort gains a tiebreaker their paging breaks in
 * a way nobody can see from here.
 */
export type Cursor = readonly [sortValue: string, id: string]

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

/**
 * The pair back out, or a 400.
 *
 * A malformed cursor is a bad request, never a 500: they arrive from URLs
 * people copy, edit and share, and half a pasted cursor must not page anybody.
 */
export function decodeCursor(raw: string): Cursor {
  let parsed: unknown

  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  } catch {
    throw badCursor()
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== 'string' ||
    typeof parsed[1] !== 'string'
  ) {
    throw badCursor()
  }

  return [parsed[0], parsed[1]]
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
