import * as Sentry from '@sentry/nestjs'

/**
 * Jobs run at 03:05 with nobody watching, so a log line is where a failure
 * goes to be unread. The log stays — it is what you read once you are already
 * looking — and these put the same thing somewhere that comes and finds you.
 *
 * Both are inert without a DSN, so development is unchanged.
 */
const scope = { tags: { area: 'maintenance' } }

/** Something threw. */
export function alertFailure(
  error: unknown,
  context: Record<string, unknown>,
): void {
  Sentry.captureException(error, { ...scope, extra: context })
}

/** Nothing threw, but the state is wrong — no Error exists to report. */
export function alertCondition(
  message: string,
  context: Record<string, unknown>,
): void {
  Sentry.captureMessage(message, { ...scope, level: 'error', extra: context })
}
