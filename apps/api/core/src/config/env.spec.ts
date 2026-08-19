import { describe, expect, it } from 'vitest'

import { validateEnv } from './env'

// The one variable with no default — every case below has to supply it.
const required = { DATABASE_URL: 'postgres://app:app@localhost:5432/app' }

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
      validateEnv({ DATABASE_URL: 'mysql://app@localhost:3306/app' }),
    ).toThrow(/DATABASE_URL/)
  })
})
