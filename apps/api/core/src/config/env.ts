import { z } from 'zod'

/**
 * Every environment variable the API reads, validated once at boot.
 *
 * Add new variables here as they are introduced — a missing or malformed
 * value must fail the process on startup, never surface as `undefined`
 * halfway through a request. Phase 0 adds DATABASE_URL, the MinIO keys,
 * the JWT secrets and the Resend key to this schema.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
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
