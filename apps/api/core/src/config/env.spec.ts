import { describe, expect, it } from 'vitest'

import { validateDatabaseUrl, validateEnv } from './env'

// The variables with no default — every case below has to supply them.
const required = {
  DATABASE_URL: 'postgres://app:app@localhost:5432/app',
  S3_HOST: 'localhost',
  S3_ACCESS_KEY: 'GK0000000000000000000000de',
  S3_SECRET_KEY: '0'.repeat(63) + '1',
  S3_BUCKET: 'taskflow',
  JWT_SECRET: 'a'.repeat(32),
  // Exactly 32 bytes, because the schema measures the decoded length rather
  // than the string's — a base64 string that looks the right size and decodes
  // to 31 bytes is the mistake worth failing at boot.
  TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
}

// What production additionally demands, on top of `required`.
const productionOnly = {
  NODE_ENV: 'production',
  RESEND_API_KEY: 're_live_key',
  SENTRY_DSN: 'https://abc123@o1.ingest.sentry.io/1',
}

describe('validateEnv', () => {
  it('applies defaults when optional variables are absent', () => {
    const env = validateEnv({ ...required })

    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(4001)
    expect(env.LOG_LEVEL).toBe('info')
  })

  it('coerces PORT from the string the environment actually provides', () => {
    expect(validateEnv({ ...required, PORT: '8080' }).PORT).toBe(8080)
  })

  it('throws on a malformed value rather than falling back to a default', () => {
    expect(() => validateEnv({ ...required, PORT: 'not-a-port' })).toThrow(
      /Invalid environment variables/,
    )
  })

  it('rejects a LOG_LEVEL that pino would not understand', () => {
    expect(() => validateEnv({ ...required, LOG_LEVEL: 'verbose' })).toThrow(
      /LOG_LEVEL/,
    )
  })

  it('refuses to boot without DATABASE_URL rather than defaulting to localhost', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/)
  })

  it('rejects a DATABASE_URL that is not a postgres connection string', () => {
    expect(() =>
      validateEnv({
        ...required,
        DATABASE_URL: 'mysql://app@localhost:3306/app',
      }),
    ).toThrow(/DATABASE_URL/)
  })

  it('lets a developer boot without a Resend key or a Sentry DSN', () => {
    // Without this, nobody without accounts at both can run the API at all.
    const env = validateEnv({ ...required })

    expect(env.RESEND_API_KEY).toBeUndefined()
    expect(env.SENTRY_DSN).toBeUndefined()
  })

  it('refuses to boot production without either', () => {
    // The other half of the bargain. Missing Resend writes notifications to
    // the log; missing Sentry reports errors nowhere. Neither is something a
    // real deployment should be able to do quietly.
    expect(() => validateEnv({ ...required, NODE_ENV: 'production' })).toThrow(
      /RESEND_API_KEY/,
    )

    expect(() =>
      validateEnv({
        ...required,
        NODE_ENV: 'production',
        RESEND_API_KEY: 're_live_key',
      }),
    ).toThrow(/SENTRY_DSN/)

    expect(() => validateEnv({ ...required, ...productionOnly })).not.toThrow()
  })

  it('refuses to boot without a JWT secret, and refuses a short one', () => {
    // No default anywhere: a fallback secret is a secret everyone has. The
    // floor is HS256's own output length — a shorter key still boots and still
    // signs, which is exactly what makes it worth checking here.
    const { TOTP_ENCRYPTION_KEY: _key, ...withoutTotpKey } = required
    expect(() => validateEnv(withoutTotpKey)).toThrow(/TOTP_ENCRYPTION_KEY/)

    // Decoded length, not string length: 24 base64 characters look plausible
    // and decode to 16 bytes, which AES-256 will not take.
    expect(() =>
      validateEnv({
        ...required,
        TOTP_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString('base64'),
      }),
    ).toThrow(/TOTP_ENCRYPTION_KEY/)

    const { JWT_SECRET: _omitted, ...withoutSecret } = required

    expect(() => validateEnv(withoutSecret)).toThrow(/JWT_SECRET/)
    expect(() =>
      validateEnv({ ...required, JWT_SECRET: 'a'.repeat(31) }),
    ).toThrow(/JWT_SECRET/)
  })

  it('defaults the login lockout and coerces it from strings', () => {
    const defaults = validateEnv({ ...required })

    expect(defaults.LOGIN_MAX_ATTEMPTS).toBe(5)
    expect(defaults.LOGIN_LOCK_MINUTES).toBe(15)

    expect(
      validateEnv({ ...required, LOGIN_MAX_ATTEMPTS: '3' }).LOGIN_MAX_ATTEMPTS,
    ).toBe(3)
    // Zero attempts locks everyone out on their first try, and a zero-minute
    // lock is no lock at all.
    expect(() => validateEnv({ ...required, LOGIN_MAX_ATTEMPTS: '0' })).toThrow(
      /LOGIN_MAX_ATTEMPTS/,
    )
    expect(() =>
      validateEnv({ ...required, LOGIN_LOCK_MINUTES: '-5' }),
    ).toThrow(/LOGIN_LOCK_MINUTES/)
  })

  it('rejects a Sentry DSN that is not a URL', () => {
    expect(() => validateEnv({ ...required, SENTRY_DSN: 'not-a-dsn' })).toThrow(
      /SENTRY_DSN/,
    )
  })

  it('reads an empty variable as absent, not as a malformed one', () => {
    // `FOO=` in a .env file and a compose `${FOO:-}` both arrive as ''. It
    // means off, and checking '' against the shape reports one missing value
    // as two errors.
    expect(
      validateEnv({ ...required, SENTRY_DSN: '', RESEND_API_KEY: '' })
        .SENTRY_DSN,
    ).toBeUndefined()

    const error = (() => {
      try {
        validateEnv({ ...required, NODE_ENV: 'production', SENTRY_DSN: '' })
      } catch (cause) {
        return String(cause)
      }
      return ''
    })()

    expect(error).toMatch(/is required when NODE_ENV=production/)
    expect(error).not.toMatch(/Invalid URL/)
  })
})

describe('validateDatabaseUrl', () => {
  it('needs nothing but the URL', () => {
    // What the TypeORM CLI runs on. A migration that cannot be applied until
    // the container is given a Resend key is a deploy blocked on a variable
    // the migration never reads.
    expect(validateDatabaseUrl({ DATABASE_URL: required.DATABASE_URL })).toBe(
      required.DATABASE_URL,
    )

    expect(() =>
      validateDatabaseUrl({
        DATABASE_URL: required.DATABASE_URL,
        NODE_ENV: 'production',
      }),
    ).not.toThrow()
  })

  it('still rejects a URL that is not postgres', () => {
    expect(() =>
      validateDatabaseUrl({ DATABASE_URL: 'mysql://app@localhost/app' }),
    ).toThrow(/postgres/)

    expect(() => validateDatabaseUrl({})).toThrow(
      /Invalid environment variables/,
    )
  })
})
