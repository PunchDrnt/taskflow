import * as Sentry from '@sentry/nextjs'

/**
 * NEXT_PUBLIC_SENTRY_DSN is inlined when the bundle is built, so it is a build
 * argument in the Dockerfile rather than an environment variable in compose.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
