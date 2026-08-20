import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

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

    it('gives a member the run of the org read-only, plus new projects', () => {
      const member = actor('member')

      // A project is a channel, not a department — anyone may start one.
      expect(permissions.can(member, 'create', 'Project', {})).toBe(true)
      expect(permissions.can(member, 'read', 'Task', {})).toBe(true)
      expect(permissions.can(member, 'delete', 'Project', {})).toBe(false)
      expect(permissions.can(member, 'update', 'Team', {})).toBe(false)
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
      // 'create Project' comes from the org role and names no row, so an
      // empty resource is the honest way to ask.
      expect(permissions.can(lead, 'create', 'Project', {})).toBe(true)
    })
  })

  describe('assert', () => {
    it('throws Forbidden rather than returning false', () => {
      expect(() =>
        permissions.assert(actor('member'), 'delete', 'Organization', {}),
      ).toThrow(ForbiddenException)

      expect(() =>
        permissions.assert(actor('owner'), 'delete', 'Organization', {}),
      ).not.toThrow()
    })

    it('names the row it refused', () => {
      expect(() =>
        permissions.assert(actor('member'), 'delete', 'Project', {
          id: 'project-9',
        }),
      ).toThrow(/project-9/)
    })
  })
})
