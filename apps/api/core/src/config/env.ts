import { z } from 'zod'

/**
 * Reads an empty variable as absent.
 *
 * `FOO=` in a .env file, or a compose `${FOO:-}` that resolves to nothing, is
 * how people turn an optional thing off. Without this the empty string is
 * checked against the shape instead, and one missing value reports as two
 * errors — a malformed URL and a missing requirement.
 */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  )
}

// Named separately because the TypeORM CLI validates this one on its own.
const databaseUrlSchema = z
  .string()
  .min(1)
  .refine((value) => /^postgres(ql)?:\/\//.test(value), {
    message: 'must be a postgres:// or postgresql:// connection string',
  })

/**
 * Every environment variable the API reads, validated once at boot. Add new
 * ones here: a bad value must stop the process, not surface as `undefined`
 * mid-request. Phase 1 still owes the Google OAuth credentials.
 */
const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // No default on purpose: a fallback like localhost would let a
    // misconfigured deployment boot and quietly talk to the wrong database.
    DATABASE_URL: databaseUrlSchema,
    // On by default: a deployment that quietly stops deleting personal data is
    // the failure that matters. Off for a dev machine on a shared database — a
    // second container is already covered by the advisory lock.
    JOBS_ENABLED: z.stringbool().default(true),

    // Auth. The secret signs the access token, so rotating it logs everyone
    // out — which is the point of having one. 32 characters is the floor
    // rather than the recommendation: HS256's key should be at least as long
    // as its output, and a short one is the kind of mistake that still boots.
    JWT_SECRET: z.string().min(32),
    // Login lockout, per docs/04-features/phase-1.md#auth--users. Both are
    // configurable because the right numbers for a 100-person internal tool
    // and for a public SaaS are not the same, and neither is worth a deploy.
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
    // Forgotten-password links, per docs/01-architecture.md#auth. Thirty
    // minutes rather than ten because the real protection is that the token is
    // single-use; a window too short for somebody checking mail on a phone
    // between meetings just produces repeated requests, which is not safer.
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    // Per email address, per hour. Caps how much mail one address can be made
    // to receive, which is the abuse this endpoint enables — it answers 204
    // whether or not the account exists, so there is nothing else to limit on.
    PASSWORD_RESET_MAX_PER_HOUR: z.coerce.number().int().positive().default(3),
    // Where the emailed link points. Not derivable from the request: mail is
    // rendered by OutboxWorker long after it, and behind Caddy the Host header
    // is whatever the proxy passed on.
    APP_URL: z.url().default('http://localhost:3000'),

    // Object storage. Named for the protocol rather than the server, which is
    // a deployment choice — Garage in docker-compose.yml, and nothing in the
    // code knows that. No defaults, for the reason DATABASE_URL has none.
    // A host, not a URL: the scheme comes from S3_USE_SSL and the port from
    // S3_PORT, so `localhost` and `garage` are what belong here. Named
    // S3_ENDPOINT once, which invited a full URL and produced
    // `http://https://host:4900`.
    S3_HOST: z.string().min(1),
    S3_PORT: z.coerce.number().int().positive().default(4900),
    S3_USE_SSL: z.stringbool().default(false),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    // Must match the server's. Garage defaults to "garage" and the AWS SDK to
    // "us-east-1"; a mismatch fails every request as a malformed
    // Authorization header, which does not read like a region problem.
    S3_REGION: z.string().min(1).default('us-east-1'),

    // Error tracking. Read directly by src/instrument.ts, which runs before
    // ConfigService exists; declared here so a malformed value still stops the
    // process, and so this file stays the list of what the API reads.
    SENTRY_DSN: optional(z.url()),
    SENTRY_ENVIRONMENT: optional(z.string().min(1)),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),

    // Optional, unlike the rest — a developer has no Resend account, and
    // without a key EmailService writes the message to the log instead of
    // sending it. The refine below makes that a development-only affordance:
    // production fails at boot rather than delivering notifications to stdout.
    RESEND_API_KEY: optional(z.string().min(1)),
    EMAIL_FROM: z.string().min(1).default('Taskflow <noreply@taskflow.local>'),
  })
  .refine(
    (env) => env.NODE_ENV !== 'production' || Boolean(env.RESEND_API_KEY),
    {
      path: ['RESEND_API_KEY'],
      message: 'is required when NODE_ENV=production',
    },
  )
  // Same bargain as RESEND_API_KEY: absent is a developer affordance, and a
  // production deployment that reports its errors nowhere is the failure
  // nobody notices until they need the report.
  .refine((env) => env.NODE_ENV !== 'production' || Boolean(env.SENTRY_DSN), {
    path: ['SENTRY_DSN'],
    message: 'is required when NODE_ENV=production',
  })

export type Env = z.infer<typeof envSchema>

function describe(error: z.ZodError): string {
  const issues = error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')

  return `Invalid environment variables:\n${issues}`
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw)

  if (!result.success) throw new Error(describe(result.error))

  return result.data
}

/**
 * The database URL alone, for the TypeORM CLI.
 *
 * Holding a migration to the whole schema means it cannot run without a Resend
 * key and S3 credentials it will never touch — which is a deploy blocked on a
 * variable that has nothing to do with the change being applied.
 */
export function validateDatabaseUrl(raw: Record<string, unknown>): string {
  const result = z.object({ DATABASE_URL: databaseUrlSchema }).safeParse(raw)

  if (!result.success) throw new Error(describe(result.error))

  return result.data.DATABASE_URL
}
