import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as Sentry from '@sentry/nestjs'

/**
 * Imported on the first line of main.ts: Sentry patches modules as they load,
 * so anything imported earlier is invisible to it. That is also why it reads
 * `process.env` rather than `ConfigService`, which does not exist yet — the
 * variables are still declared in config/env.ts.
 */
const rootEnvFile = join(__dirname, '..', '..', '..', '..', '.env')
if (existsSync(rootEnvFile)) {
  // Does not overwrite what is already set, so a container's own environment
  // still wins over a stray file.
  process.loadEnvFile(rootEnvFile)
}

const dsn = process.env.SENTRY_DSN

// No DSN means no reporting, not a broken boot. config/env.ts is what refuses
// to start production without one.
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // Traces are billed per span, and a ~20-user internal tool has no
    // performance question worth that.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    sendDefaultPii: false,
  })
}
