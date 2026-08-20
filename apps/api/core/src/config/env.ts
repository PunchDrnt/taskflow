import { z } from 'zod'

/**
 * Every environment variable the API reads, validated once at boot. Add new
 * ones here: a bad value must stop the process, not surface as `undefined`
 * mid-request. Still to come in Phase 0: `MINIO_*`, `JWT_*`, `RESEND_API_KEY`.
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
  // On by default: a deployment that quietly stops deleting personal data is
  // the failure that matters. Off for a dev machine on a shared database — a
  // second container is already covered by the advisory lock.
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
