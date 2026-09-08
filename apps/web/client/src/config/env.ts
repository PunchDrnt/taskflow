import { z } from 'zod'

/**
 * The server half's environment, validated once at module load, the same way
 * `apps/api/core/src/config/env.ts` does it and for the same reason: a missing
 * value should stop the process at start-up rather than surface as `undefined`
 * in the middle of somebody's request.
 *
 * Only the **server** half. Anything the browser needs is a `NEXT_PUBLIC_*`
 * variable inlined at build time, which is a different mechanism with
 * different failure modes — see `NEXT_PUBLIC_SENTRY_DSN` in the root
 * `.env.example`. Nothing here is inlined, so nothing here can leak: Next
 * replaces a non-public `process.env.X` with `undefined` in the client bundle.
 *
 * Deliberately no `server-only` import. `proxy.ts` reads this, and Next 16
 * compiles the proxy as plain Node rather than under the `react-server`
 * condition — `server-only` resolves to its throwing build there and would
 * take the whole proxy down at runtime.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  /**
   * Where this Next server reaches the API, **server to server**. Not the URL
   * the browser uses: the browser goes to `/api/*` on this same origin and
   * Caddy forwards it, which is the whole basis of `SameSite=Lax` being enough
   * (docs/01-architecture.md#csrf).
   */
  API_INTERNAL_URL: z.url('API_INTERNAL_URL must be a full URL').optional(),
})

/**
 * What `docker compose up -d` gives you locally, matching `PORT` in the root
 * `.env.example`. A default only outside production — inside a container there
 * is no localhost to fall back to.
 */
const DEV_API_URL = 'http://localhost:4001'

/**
 * The **shape** is checked at module load; whether the value is *present* is
 * checked the first time something needs it. That split is not a compromise,
 * it is the correct boundary, and getting it wrong is how this file failed
 * first: `next build` runs with `NODE_ENV=production`, so an eager
 * "required in production" check made the build demand the address of an API
 * that does not exist yet and is never contacted during it. CI would have gone
 * red for a variable no build step reads.
 *
 * So a malformed URL still stops everything immediately, and a missing one
 * stops the first request that would have used it — with a message naming the
 * file that sets it, rather than a fetch to `undefined/v1/me`.
 */
const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`)
}

// Bound out of the result union here rather than read through `parsed` below:
// the narrowing the `throw` above performs does not reach inside a function
// body, so `parsed.data` is optional again by the time it is used.
const values = parsed.data

let resolvedApiUrl: string | null = null

function apiInternalUrl(): string {
  if (resolvedApiUrl !== null) return resolvedApiUrl

  if (
    values.API_INTERNAL_URL === undefined &&
    values.NODE_ENV === 'production'
  ) {
    throw new Error(
      'API_INTERNAL_URL is required when serving in production — ' +
        'deploy/compose.yml sets it to http://api:4001',
    )
  }

  // Trailing slashes turn `${base}/v1/me` into `${base}//v1/me`, which some
  // proxies normalise and some answer 404 to.
  resolvedApiUrl = (values.API_INTERNAL_URL ?? DEV_API_URL).replace(/\/+$/, '')

  return resolvedApiUrl
}

export const env = {
  nodeEnv: values.NODE_ENV,
  get apiInternalUrl(): string {
    return apiInternalUrl()
  },
}
