import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

import { env } from './src/config/env'

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

  /**
   * What Caddy does in production, done here for `yarn dev`.
   *
   * `deploy/config/Caddyfile` routes `/api/*` to Nest with `handle_path`,
   * which **strips** the prefix — so the browser asks for `/api/v1/me` and the
   * route that answers is `/v1/me`. That stripping is why `main.ts` sets the
   * global prefix to `v1` rather than `api/v1`, and reproducing it exactly is
   * the point of the `:path*` shape below.
   *
   * Without it there is no `/api` on this origin at all locally, so every
   * request 404s at Next before reaching the API — and, more quietly, the
   * refresh cookie's `path=/api/v1/auth` matches a URL that never exists, so
   * nothing about the session flow can be tested at all.
   *
   * Not registered in production: Caddy has already handled `/api/*` before
   * Next is reached, so a rewrite here would be dead configuration that reads
   * like a second, competing route table.
   */
  async rewrites() {
    if (env.nodeEnv === 'production') return []

    return [
      { source: '/api/:path*', destination: `${env.apiInternalUrl}/:path*` },
    ]
  },
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
