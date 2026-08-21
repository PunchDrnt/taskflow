import { describe, expect, it } from 'vitest'

import { FeatureService } from './feature.service'

describe('FeatureService', () => {
  it('allows everything, which is the whole of Phase 0', () => {
    // The test exists to fail the day someone makes this return false without
    // the plan lookup that is supposed to come with it.
    expect(
      new FeatureService().isEnabled('any-org', 'public_registration'),
    ).toBe(true)
  })
})
