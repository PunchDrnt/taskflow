import { describe, expect, it } from 'vitest'

import { validateDatabaseUrl, validateEnv } from './env'

// The variables with no default — every case below has to supply them.
const required = {
  DATABASE_URL: 'postgres://app:app@localhost:5432/app',
  S3_ENDPOINT: 'localhost',
  S3_ACCESS_KEY: 'GK0000000000000000000000de',
  S3_SECRET_KEY: '0'.repeat(63) + '1',
  S3_BUCKET: 'taskflow',
}

describe('validateEnv', () => {
  it('applies defaults when optional variables are absent', () => {
    const env = validateEnv({ ...required })

    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(3001)
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

  it('lets a developer boot without a Resend key', () => {
    // Without this, nobody without a Resend account can run the API at all.
    expect(validateEnv({ ...required }).RESEND_API_KEY).toBeUndefined()
  })

  it('refuses to boot production without one', () => {
    // The other half of the bargain: the fallback writes notifications to the
    // log, which must never be what a real deployment does.
    expect(() => validateEnv({ ...required, NODE_ENV: 'production' })).toThrow(
      /RESEND_API_KEY/,
    )

    expect(() =>
      validateEnv({
        ...required,
        NODE_ENV: 'production',
        RESEND_API_KEY: 're_live_key',
      }),
    ).not.toThrow()
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
