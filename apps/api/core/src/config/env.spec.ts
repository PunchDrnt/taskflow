import { describe, expect, it } from 'vitest'

import { validateEnv } from './env'

describe('validateEnv', () => {
  it('applies defaults when optional variables are absent', () => {
    const env = validateEnv({})

    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(3001)
    expect(env.LOG_LEVEL).toBe('info')
  })

  it('coerces PORT from the string the environment actually provides', () => {
    expect(validateEnv({ PORT: '8080' }).PORT).toBe(8080)
  })

  it('throws on a malformed value rather than falling back to a default', () => {
    expect(() => validateEnv({ PORT: 'not-a-port' })).toThrow(
      /Invalid environment variables/,
    )
  })

  it('rejects a LOG_LEVEL that pino would not understand', () => {
    expect(() => validateEnv({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/)
  })
})
