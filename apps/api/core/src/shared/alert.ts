import * as Sentry from '@sentry/nestjs'

/**
 * Which part of the system is reporting.
 *
 * A union rather than a free string: the tag is what a Sentry alert rule
 * filters on, so a typo is an alert that exists and nobody receives.
 */
export type AlertArea = 'maintenance' | 'notify'

export interface Alerts {
  /** Something threw. */
  failure(error: unknown, context: Record<string, unknown>): void
  /** Nothing threw, but the state is wrong — no Error exists to report. */
  condition(message: string, context: Record<string, unknown>): void
}

/**
 * Work that nobody is watching — a cron at 03:05, a delivery retried in the
 * background — needs somewhere to fail out loud. The log line stays: it is
 * what you read once you are already looking. These put the same thing
 * somewhere that comes and finds you.
 *
 * Bound to an area once per module rather than passed at every call: the tag
 * is the part a call site would get wrong, and it is the part that decides
 * who hears about it.
 *
 * Inert without a DSN, so development is unchanged.
 */
export function alertsFor(area: AlertArea): Alerts {
  const scope = { tags: { area } }

  return {
    failure(error, context) {
      Sentry.captureException(error, { ...scope, extra: context })
    },
    condition(message, context) {
      Sentry.captureMessage(message, {
        ...scope,
        level: 'error',
        extra: context,
      })
    },
  }
}
