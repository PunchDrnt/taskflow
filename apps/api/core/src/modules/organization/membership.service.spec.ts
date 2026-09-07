import { describe, expect, it } from 'vitest'

import { resolveActiveOrg, type Membership } from './membership.service'

const acme: Membership = {
  orgId: '11111111-1111-4111-8111-111111111111',
  name: 'Acme',
  slug: 'acme',
  role: 'owner',
}
const globex: Membership = {
  orgId: '22222222-2222-4222-8222-222222222222',
  name: 'Globex',
  slug: 'globex',
  role: 'member',
}
const stranger = '33333333-3333-4333-8333-333333333333'

/** Every row of the table in docs/01-architecture.md#org-ไหนของ-request-นี้. */
describe('resolveActiveOrg', () => {
  it('honours a cookie naming an org they belong to', () => {
    expect(resolveActiveOrg([acme, globex], globex.orgId)).toEqual({
      orgId: globex.orgId,
      orgRole: 'member',
      clearCookie: false,
    })
  })

  it('clears a cookie naming an org they do not belong to', () => {
    // The clearing is the point, not the refusal. A stale choice left in place
    // 403s every request until somebody clears their browser by hand.
    expect(resolveActiveOrg([acme], stranger)).toEqual({
      orgId: null,
      orgRole: null,
      clearCookie: true,
    })
  })

  it('clears the cookie of someone who has been removed from that org', () => {
    // Same input as above from this function's side, and the case that
    // actually happens: the cookie was valid when it was set.
    expect(resolveActiveOrg([], acme.orgId)).toEqual({
      orgId: null,
      orgRole: null,
      clearCookie: true,
    })
  })

  it('picks the only org without being asked', () => {
    expect(resolveActiveOrg([acme], undefined)).toEqual({
      orgId: acme.orgId,
      orgRole: 'owner',
      clearCookie: false,
    })
  })

  it('picks nothing when there are several and no cookie', () => {
    // Null here, ORG_NOT_SELECTED at the guard — the client shows a picker.
    expect(resolveActiveOrg([acme, globex], undefined)).toEqual({
      orgId: null,
      orgRole: null,
      clearCookie: false,
    })
  })

  it('picks nothing when they belong to none, and clears nothing', () => {
    // Null for a different reason, and NO_ORGANIZATION at the guard. One code
    // for both would send somebody with three companies to a
    // create-your-first-organization page.
    expect(resolveActiveOrg([], undefined)).toEqual({
      orgId: null,
      orgRole: null,
      clearCookie: false,
    })
  })

  it('reads an empty cookie as no cookie', () => {
    // What a cleared cookie can arrive as, and it must not be treated as a
    // choice naming an org called ''.
    expect(resolveActiveOrg([acme], '')).toEqual({
      orgId: acme.orgId,
      orgRole: 'owner',
      clearCookie: false,
    })
  })

  it('never returns an org the caller is not a member of', () => {
    // The invariant the other cases are instances of: the cookie is a choice,
    // never a permission, so no input can widen the answer past the list.
    const cookies = [undefined, '', acme.orgId, globex.orgId, stranger]

    for (const memberships of [[], [acme], [acme, globex]]) {
      for (const cookie of cookies) {
        const { orgId, orgRole } = resolveActiveOrg(memberships, cookie)

        expect(
          orgId === null ||
            memberships.some((membership) => membership.orgId === orgId),
        ).toBe(true)

        // The role must come from the membership that was chosen, never from
        // another one in the list. Every permission decision downstream reads
        // it, so a role paired with the wrong org is an admin somewhere they
        // are only a member — and it would look like an ordinary pass.
        expect(orgRole).toBe(
          memberships.find((membership) => membership.orgId === orgId)?.role ??
            null,
        )
      }
    }
  })
})
