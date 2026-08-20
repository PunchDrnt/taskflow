import { z } from 'zod'

/**
 * Every environment variable the API reads, validated once at boot.
 *
 * Add new variables here as they are introduced — a missing or malformed
 * value must fail the process on startup, never surface as `undefined`
 * halfway through a request. Phase 0 still adds the MinIO keys, the JWT
 * secrets and the Resend key to this schema.
 */
export const envSchema = z.object({
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
  // Retention and audit-log partition upkeep. On by default, because a
  // deployment that quietly stops deleting personal data is the failure that
  // matters. Turn it off for a process that should not run them — a second API
  // container is already covered by the advisory lock, but a developer pointed
  // at a shared database is not.
  JOBS_ENABLED: z.stringbool().default(true),
})

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
