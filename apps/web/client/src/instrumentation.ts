import * as Sentry from '@sentry/nextjs'

/** Server and edge runtimes. No DSN means no reporting, as in the API. */
export async function register() {
  if (!process.env.SENTRY_DSN) return

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    sendDefaultPii: false,
  })
}

// Errors thrown while rendering reach Sentry only through this export.
export const onRequestError = Sentry.captureRequestError
