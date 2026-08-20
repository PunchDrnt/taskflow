import { z } from 'zod'

/**
 * Every environment variable the API reads, validated once at boot. Add new
 * ones here: a bad value must stop the process, not surface as `undefined`
 * mid-request. Still to come in Phase 0: `JWT_*`.
 */
export const envSchema = z
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
    DATABASE_URL: z
      .string()
      .min(1)
      .refine((value) => /^postgres(ql)?:\/\//.test(value), {
        message: 'must be a postgres:// or postgresql:// connection string',
      }),
    // On by default: a deployment that quietly stops deleting personal data is
    // the failure that matters. Off for a dev machine on a shared database — a
    // second container is already covered by the advisory lock.
    JOBS_ENABLED: z.stringbool().default(true),

    // Object storage. Named for the protocol rather than the server, which is
    // a deployment choice — Garage in docker-compose.yml, and nothing in the
    // code knows that. No defaults, for the reason DATABASE_URL has none.
    S3_ENDPOINT: z.string().min(1),
    S3_PORT: z.coerce.number().int().positive().default(3900),
    S3_USE_SSL: z.stringbool().default(false),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    // Must match the server's. Garage defaults to "garage" and the AWS SDK to
    // "us-east-1"; a mismatch fails every request as a malformed
    // Authorization header, which does not read like a region problem.
    S3_REGION: z.string().min(1).default('us-east-1'),

    // Optional, unlike the rest — a developer has no Resend account, and
    // without a key EmailService writes the message to the log instead of
    // sending it. The refine below makes that a development-only affordance:
    // production fails at boot rather than delivering notifications to stdout.
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1).default('Taskflow <noreply@taskflow.local>'),
  })
  .refine(
    (env) => env.NODE_ENV !== 'production' || Boolean(env.RESEND_API_KEY),
    {
      path: ['RESEND_API_KEY'],
      message: 'is required when NODE_ENV=production',
    },
  )

export type Env = z.infer<typeof envSchema>

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw)

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')

    throw new Error(`Invalid environment variables:\n${issues}`)
  }

  return result.data
}
