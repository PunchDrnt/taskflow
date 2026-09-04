import { describe, expect, it } from 'vitest'

import { idSchema, setActiveOrgSchema } from '@repo/shared'

import { SYSTEM_USER_ID } from '#shared/system-user'

/**
 * Pins `idSchema` to the ids this system really stores rather than to the RFC.
 *
 * The endpoint that found this was `POST /v1/me/active-org`, which answered
 * `VALIDATION_FAILED` for the seeded org id under `z.uuid()`. Nothing in the
 * suite caught it because the integration tests build their rows with
 * `crypto.randomUUID()` — every id they invent is a v4, so the only ids that
 * fail are the ones written by hand, which is to say the ones a person types.
 */
describe('idSchema', () => {
  const schema = idSchema('bad id')

  it('accepts the ids the application itself writes', () => {
    // The nil UUID, in `created_by` on every row the system writes.
    expect(schema.safeParse(SYSTEM_USER_ID).success).toBe(true)
    // The demo seed, readable on purpose so it can be spotted in a log.
    expect(
      schema.safeParse('11111111-1111-1111-1111-111111111111').success,
    ).toBe(true)
    // What `gen_random_uuid()` produces.
    expect(schema.safeParse(crypto.randomUUID()).success).toBe(true)
  })

  it('still rejects anything that is not uuid-shaped', () => {
    for (const value of [
      '',
      'not-an-id',
      '11111111-1111-1111-1111',
      42,
      null,
    ]) {
      expect(schema.safeParse(value).success).toBe(false)
    }
  })

  it('carries the caller’s message', () => {
    const result = schema.safeParse('nope')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe('bad id')
  })

  it('is what setActiveOrgSchema validates orgId with', () => {
    expect(
      setActiveOrgSchema.safeParse({
        orgId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(true)
  })
})
