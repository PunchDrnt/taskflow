import { APP_TIME_ZONE } from './due-date'

const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  hour: 'numeric',
  hour12: false,
})

const dayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/**
 * Morning, afternoon or evening — in **Bangkok**, never in the server's zone.
 *
 * Same rule as every other formatter here, and it bites harder than most: the
 * API container runs UTC, so a greeting derived from local time would read
 * "Good morning" to somebody sitting down after dinner. One fixed zone is also
 * what keeps the server's markup and the browser's agreeing.
 */
export function greeting(now = new Date()): string {
  const hour = Number(hourFormatter.format(now))

  if (hour < 12) return 'Good morning'

  return hour < 18 ? 'Good afternoon' : 'Good evening'
}

/** `Sunday, 30 August` — the eyebrow above the greeting. */
export function todayLabel(now = new Date()): string {
  return dayFormatter.format(now)
}
