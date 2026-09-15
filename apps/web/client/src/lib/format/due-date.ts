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

/**
 * `Today` · `Tomorrow` · `12 Sep`, in the company's zone.
 *
 * Coarse on purpose. A finer relative label — "2 hours ago" — is wrong twice
 * over on a server-rendered page: it is computed once and then goes stale
 * while the tab stays open, and it disagrees with itself across the hydration
 * boundary whenever the two sides straddle a minute. A day is the smallest
 * unit that survives both.
 */
export function formatDay(iso: IsoDateTime, now = new Date()): string {
  const days = daysAway(iso, now)

  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'

  return labelFormatter.format(new Date(iso))
}

/** The same label, under the name the lists ask for it by. */
export function formatDueDate(iso: IsoDateTime, now = new Date()): string {
  return formatDay(iso, now)
}

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * The clock time in the company's zone — `16:42`.
 *
 * Paired with `formatDay` wherever something happened at a moment rather than
 * on a day: the day goes in the heading and this goes on the line, which
 * together say everything "2 hours ago" says without going stale.
 */
export function formatTimeOfDay(iso: IsoDateTime): string {
  return timeFormatter.format(new Date(iso))
}

/**
 * The Bangkok calendar day an instant falls on, as `YYYY-MM-DD`.
 *
 * The inverse of `startOfDay` / `endOfDay`, and the form a day picker and a
 * day heading both want: two instants seven hours apart can be the same day
 * here and different days in UTC, so the grouping has to be done in the zone
 * the reader lives in rather than the one the container runs in.
 */
export function toCalendarDay(iso: IsoDateTime): string {
  return calendarDay(new Date(iso))
}

/**
 * A calendar day in the company's zone, as the instant it begins.
 *
 * 🔒 The API takes `dueAfter` / `dueBefore` as ISO date-times **with an
 * offset**, and `dueDateSchema` refuses anything else for a reason this
 * function exists to honour: a bare `2026-09-07` is parsed as midnight UTC,
 * which is seven hours before the day starts in Bangkok. Sent that way, a
 * filter for "due from the 7th" silently includes the evening of the 6th.
 *
 * The offset is read from the zone rather than written as `+07:00`, so the one
 * place that names the zone stays the only place that knows it.
 */
function offsetOf(at: Date): string {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value

  // `longOffset` gives "GMT+07:00", and plain "GMT" for a zone sitting at UTC.
  const offset = name?.replace('GMT', '') ?? ''

  return offset === '' ? '+00:00' : offset
}

/** True for a `YYYY-MM-DD` that is a real date, not merely well-shaped. */
export function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  // `2026-02-31` parses — Date rolls it into March — so the check is that it
  // formats back to what was given.
  const parsed = new Date(`${value}T00:00:00Z`)

  return !Number.isNaN(parsed.getTime()) && calendarDay(parsed) === value
}

/**
 * The first instant of a day, in the company's zone.
 *
 * The offset is looked up from a noon instant on that day rather than from
 * midnight: a zone that shifts does so at midnight far more often than at
 * noon, and reading it from the boundary is how an hour goes missing. Bangkok
 * has no such shift, which is exactly why this would go unnoticed here.
 */
export function startOfDay(day: string): string {
  return `${day}T00:00:00${offsetOf(new Date(`${day}T12:00:00Z`))}`
}

/** The last instant of a day, in the company's zone. Inclusive, like the API. */
export function endOfDay(day: string): string {
  return `${day}T23:59:59.999${offsetOf(new Date(`${day}T12:00:00Z`))}`
}
