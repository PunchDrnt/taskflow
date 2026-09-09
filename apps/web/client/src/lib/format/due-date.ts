import type { IsoDateTime } from '@repo/shared'

/**
 * The company's calendar, pinned.
 *
 * Not the viewer's zone, and not the server's. A Server Component formats on
 * the server — in a container running UTC — while the same markup is compared
 * against what the browser would render, so anything derived from "local time"
 * disagrees with itself across the hydration boundary and shows the wrong day
 * for the seven hours a Bangkok evening is already tomorrow in UTC.
 *
 * One fixed zone makes both halves agree and makes them agree on the right
 * answer, because everybody using this is in it. It is the display-side twin
 * of the rule `dueDateSchema` enforces on the way in: a date with no zone is a
 * date whose meaning depends on which machine read it.
 *
 * When somebody outside Thailand starts using this, the fix is a per-user
 * setting — `iam.users` has no `timezone` column yet, which is a deliberate
 * gap noted in the Phase 1 checklist, not an oversight to paper over here.
 */
export const APP_TIME_ZONE = 'Asia/Bangkok'

export type DueBucket = 'overdue' | 'today' | 'soon' | 'later' | 'none'

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const labelFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  day: 'numeric',
  month: 'short',
})

/** The calendar date in Bangkok, as `YYYY-MM-DD` — sortable and comparable. */
function calendarDay(at: Date): string {
  // `en-CA` is the shortest way to an ISO-shaped date from Intl; the locale is
  // a formatting trick, not a language choice.
  return dayFormatter.format(at)
}

/** Whole days from today to `iso`, counted in Bangkok calendar days. */
function daysAway(iso: IsoDateTime, now: Date): number {
  const from = Date.parse(`${calendarDay(now)}T00:00:00Z`)
  const to = Date.parse(`${calendarDay(new Date(iso))}T00:00:00Z`)

  return Math.round((to - from) / 86_400_000)
}

/**
 * Which pile a task belongs in.
 *
 * "Overdue" is an instant comparison rather than a calendar one — a deadline
 * of 5pm has passed at 6pm, and calling that "today" would hide it under the
 * heading people scan last.
 */
export function dueBucket(
  iso: IsoDateTime | null,
  now = new Date(),
): DueBucket {
  if (iso === null) return 'none'
  if (Date.parse(iso) < now.getTime()) return 'overdue'

  const days = daysAway(iso, now)

  if (days <= 0) return 'today'

  return days <= 7 ? 'soon' : 'later'
}

/** `Today` · `Tomorrow` · `12 Sep`, in the company's zone. */
export function formatDueDate(iso: IsoDateTime, now = new Date()): string {
  const days = daysAway(iso, now)

  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'

  return labelFormatter.format(new Date(iso))
}
