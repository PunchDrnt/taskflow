import { describe, expect, it } from 'vitest'

import { runWithRequestContext } from '#shared/org-scope/request-context'

import { actorFromContext } from './actor'

const ORG = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'

describe('actorFromContext', () => {
  it('builds the actor from the context the guard filled', () => {
    runWithRequestContext(
      { orgId: ORG, userId: USER, orgRole: 'admin', sessionId: 'session-1' },
      () => {
        expect(actorFromContext()).toEqual({
          userId: USER,
          orgId: ORG,
          orgRole: 'admin',
        })
      },
    )
  })

  it('refuses when something with no membership asks', () => {
    // A cron job or a seed: it has an org because it acts for one, and no
    // role because it is not a person. Answering "yes" would hand every job
    // owner rights; answering "no" would break jobs that legitimately cross
    // orgs. Neither is right, so the question is refused instead.
    runWithRequestContext(
      { orgId: ORG, userId: USER, orgRole: null, sessionId: null },
      () => {
        expect(() => actorFromContext()).toThrow(/No role in organisation/)
      },
    )
  })

  it('refuses before that when there is no org at all', () => {
    // Signed in and acting for no org — the Home screen. `requireOrgContext`
    // is what stops this, so the failure names the org rather than the role.
    runWithRequestContext(
      { orgId: null, userId: USER, orgRole: null, sessionId: null },
      () => {
        expect(() => actorFromContext()).toThrow(/No organisation/)
      },
    )
  })
})
