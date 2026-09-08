import { describe, expect, it } from 'vitest'

import { ApiException } from '#shared/http/api-exception'

import type { Actor, OrgRole } from './actor'
import { PermissionService } from './permission.service'

/**
 * A skeleton, so these cover the role hierarchy the specification fixes and
 * nothing feature-specific. What they really guard is the shape: a rule added
 * later must not quietly widen one of these answers.
 */
describe('PermissionService', () => {
  const permissions = new PermissionService()

  const actor = (orgRole: OrgRole, rest: Partial<Actor> = {}): Actor => ({
    userId: 'user-1',
    orgId: 'org-1',
    orgRole,
    ...rest,
  })

  describe('organisation roles', () => {
    it('lets an owner dispose of the organisation', () => {
      expect(
        permissions.can(actor('owner'), 'delete', 'Organization', {}),
      ).toBe(true)
    })

    it('stops an admin short of the organisation itself', () => {
      const admin = actor('admin')

      // The whole difference between the two roles: an admin runs the org, an
      // owner owns it.
      expect(permissions.can(admin, 'delete', 'Organization', {})).toBe(false)
      expect(permissions.can(admin, 'update', 'Organization', {})).toBe(false)
      expect(permissions.can(admin, 'manage', 'Team', {})).toBe(true)
      expect(permissions.can(admin, 'delete', 'Project', {})).toBe(true)
    })

    it('gives a member the run of the org read-only and nothing more', () => {
      const member = actor('member')

      expect(permissions.can(member, 'read', 'Organization', {})).toBe(true)
      expect(permissions.can(member, 'read', 'Team', {})).toBe(true)
      expect(permissions.can(member, 'delete', 'Project', {})).toBe(false)
      expect(permissions.can(member, 'update', 'Team', {})).toBe(false)
    })

    it('🔒 does not let `read all` reach a project they have not joined', () => {
      // `can('read', 'all')` used to cover projects and tasks too, which reads
      // as harmless and is not: a member sees only the projects they are in
      // (docs/04-features/phase-1.md), and a blanket read said otherwise. The
      // two `cannot`s in `ability.ts` are given back per project by the
      // conditional rules — so this is the state of somebody with no
      // membership in the project being asked about.
      const member = actor('member')

      expect(permissions.can(member, 'read', 'Project', { id: 'p1' })).toBe(
        false,
      )
      expect(permissions.can(member, 'read', 'Task', { projectId: 'p1' })).toBe(
        false,
      )

      const joined = actor('member', { projectRoles: { p1: 'member' } })

      expect(permissions.can(joined, 'read', 'Project', { id: 'p1' })).toBe(
        true,
      )
      expect(permissions.can(joined, 'read', 'Task', { projectId: 'p1' })).toBe(
        true,
      )
      // ...and only that one.
      expect(permissions.can(joined, 'read', 'Project', { id: 'p2' })).toBe(
        false,
      )
    })

    it('does not let a member start a project', () => {
      // docs/04-features/phase-1.md#project — only an owner or an admin. The
      // rule read the other way round until §4, so this is pinned rather than
      // left to the comment beside it.
      expect(permissions.can(actor('member'), 'create', 'Project', {})).toBe(
        false,
      )
      expect(permissions.can(actor('admin'), 'create', 'Project', {})).toBe(
        true,
      )
      expect(permissions.can(actor('owner'), 'create', 'Project', {})).toBe(
        true,
      )
    })

    it('does not let a project admin start another project', () => {
      // Being trusted inside one project says nothing about starting new ones
      // — the conditional rules below grant `manage Project` on a named id,
      // and `create` names no row for them to match.
      const lead = actor('member', { projectRoles: { 'project-1': 'admin' } })

      expect(permissions.can(lead, 'create', 'Project', {})).toBe(false)
    })
  })

  describe('project membership', () => {
    const member = actor('member', { projectRoles: { 'project-1': 'member' } })
    const lead = actor('member', { projectRoles: { 'project-1': 'admin' } })

    it('is scoped to the project joined, not to projects in general', () => {
      expect(
        permissions.can(lead, 'delete', 'Project', { id: 'project-1' }),
      ).toBe(true)
      expect(
        permissions.can(lead, 'delete', 'Project', { id: 'project-2' }),
      ).toBe(false)
    })

    it('lets a project member work on that project’s tasks only', () => {
      expect(
        permissions.can(member, 'update', 'Task', { projectId: 'project-1' }),
      ).toBe(true)
      expect(
        permissions.can(member, 'delete', 'Task', { projectId: 'project-1' }),
      ).toBe(false)
      expect(
        permissions.can(member, 'update', 'Task', { projectId: 'project-2' }),
      ).toBe(false)
    })

    it('does not let project membership reach the org', () => {
      expect(permissions.can(lead, 'update', 'Organization', {})).toBe(false)
    })
  })

  describe('team membership', () => {
    it('makes a team admin the manager of that team alone', () => {
      const teamLead = actor('member', { teamRoles: { 'team-1': 'admin' } })

      expect(
        permissions.can(teamLead, 'manage', 'Team', { id: 'team-1' }),
      ).toBe(true)
      expect(
        permissions.can(teamLead, 'manage', 'Team', { id: 'team-2' }),
      ).toBe(false)
    })
  })

  describe('the resource with no attributes', () => {
    const lead = actor('member', { projectRoles: { 'project-1': 'admin' } })

    it('fails every conditional rule rather than passing them all', () => {
      // This is why `resource` is mandatory. Asked without one, CASL answers
      // "could you delete *some* project" — yes — which looks exactly like a
      // check that passed. `{}` asks the endpoint's question, and fails safe.
      expect(permissions.can(lead, 'delete', 'Project', {})).toBe(false)
      expect(permissions.isEverAllowedTo(lead, 'delete', 'Project')).toBe(true)
    })

    it('still allows what is permitted unconditionally', () => {
      // `can('read', 'all')` comes from the org role and names no row, so an
      // empty resource is the honest way to ask and the answer is yes. Not
      // `Project` or `Task`, which the member block takes back and the
      // conditional rules give out one id at a time.
      expect(permissions.can(lead, 'read', 'Organization', {})).toBe(true)
    })
  })

  describe('assert', () => {
    it('throws a client-shaped 403 rather than returning false', () => {
      expect(() =>
        permissions.assert(actor('member'), 'delete', 'Organization', {}),
      ).toThrow(ApiException)

      expect(() =>
        permissions.assert(actor('owner'), 'delete', 'Organization', {}),
      ).not.toThrow()
    })

    it('carries a message a person can read and a code a client can branch on', () => {
      // The body reaches a screen as it stands. A developer-facing English
      // sentence in `message` would be shown to whoever hit the refusal.
      const thrown = catchApiException(() =>
        permissions.assert(actor('member'), 'delete', 'Organization', {}),
      )

      expect(thrown.getStatus()).toBe(403)
      expect(thrown.code).toBe('FORBIDDEN')
      expect(thrown.message).toMatch(/permission/)
      expect(thrown.details).toEqual({
        action: 'delete',
        subject: 'Organization',
      })
    })

    it('does not name the row it refused', () => {
      // A refusal that names the id confirms the row exists. This codebase
      // answers 404 rather than 403 for a row in another org for exactly that
      // reason, and a 403 that leaks the id would undo it.
      const thrown = catchApiException(() =>
        permissions.assert(actor('member'), 'delete', 'Project', {
          id: 'project-9',
        }),
      )

      expect(JSON.stringify(thrown.getResponse())).not.toMatch(/project-9/)
    })
  })
})

/** The thrown ApiException, or a failure that says nothing was thrown. */
function catchApiException(fn: () => void): ApiException {
  try {
    fn()
  } catch (error) {
    if (error instanceof ApiException) return error
    throw error
  }

  throw new Error('expected assert to throw, and it did not')
}
