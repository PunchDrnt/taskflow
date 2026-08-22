import { describe, expect, it } from 'vitest'

import { provideOrgRepository } from '#shared/org-scope/org-repository.provider'

import { entities } from './entities'

describe('the registered entities', () => {
  it('have distinct class names, because the DI token is built from one', () => {
    // provideOrgRepository keys on the class name alone, so two entities
    // called Member — one in organization, one in project — would resolve to
    // the same token and hand one module the other's table, with no error
    // anywhere. They are OrganizationMember and ProjectMember today; this is
    // what keeps the next pair from being named carelessly.
    // Read the same way provideOrgRepository reads it, so the test cannot
    // pass on a name the token builder would derive differently.
    const names = entities.map((entity) =>
      typeof entity === 'function' ? entity.name : String(entity),
    )
    const duplicated = names.filter(
      (name, index) => names.indexOf(name) !== index,
    )

    expect(duplicated).toEqual([])
  })

  it('each get their own repository token', () => {
    const tokens = entities.map(
      (entity) => (provideOrgRepository(entity) as { provide: string }).provide,
    )

    expect(new Set(tokens).size).toBe(entities.length)
  })
})
