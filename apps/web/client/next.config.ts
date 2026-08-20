import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const here = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  transpilePackages: ['@repo/ui'],

  // Emits .next/standalone with only the files the server actually reaches,
  // so the runtime image needs no node_modules of its own.
  output: 'standalone',

  // Without this Next traces from this directory and misses the hoisted
  // node_modules at the repository root, producing a server that cannot
  // resolve react.
  outputFileTracingRoot: join(here, '../../..'),
}

export default withSentryConfig(nextConfig, {
  // The plugin prints a banner and upload warnings on every build otherwise.
  silent: true,

  // Source maps go nowhere without an auth token. Uploading them is a
  // deployment decision — set SENTRY_AUTH_TOKEN in CI and flip this.
  sourcemaps: { disable: true },

  // Ad blockers block requests to ingest.sentry.io by name, which loses
  // browser errors from the users most likely to hit one. This routes them
  // through the app's own origin. Implemented as a rewrite, not a route.
  tunnelRoute: '/monitoring',
})
