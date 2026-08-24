import { describe, expect, it } from 'vitest'

import { FEATURES, FeatureService, type Feature } from './feature.service'

describe('FeatureService', () => {
  const service = new FeatureService()

  // docs/04-features.md says /register is gated by this flag "which returns
  // false from the first line". The code returned true, so building the
  // endpoint to spec would have shipped public registration open in a phase
  // with one org. Asserted rather than commented, because a comment is what
  // let the two drift apart.
  it('does not enable public registration', () => {
    expect(service.isEnabled('any-org', 'public_registration')).toBe(false)
  })

  it('enables nothing at all in Phase 1', () => {
    const enabled = FEATURES.filter((feature) =>
      service.isEnabled('any-org', feature),
    )

    expect(enabled).toEqual([])
  })

  // The property that makes the allow-list worth having: a name nobody has
  // enabled is off, so adding to FEATURES gates a feature rather than opening
  // one. Cast, because a future feature has no type yet — which is the case
  // being tested.
  it('treats a feature nobody enabled as off', () => {
    expect(service.isEnabled('any-org', 'some_future_feature' as Feature)).toBe(
      false,
    )
  })

  it('answers the same for every org, since plans arrive in Phase 7', () => {
    expect(service.isEnabled('org-a', 'public_registration')).toBe(
      service.isEnabled('org-b', 'public_registration'),
    )
  })
})
