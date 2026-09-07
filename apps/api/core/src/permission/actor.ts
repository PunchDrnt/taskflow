import {
  ORG_ROLES,
  SCOPED_ROLES,
  type OrgRole,
  type ScopedRole,
} from '@repo/shared'

import { requireOrgContext } from '#shared/org-scope/request-context'

/**
 * The role lists live in `@repo/shared` because the web renders them too —
 * see the docblock there. Re-exported so this file stays the one place a
 * permission question imports from, rather than every call site having to
 * know which half of the monorepo a role name comes from.
 */
export { ORG_ROLES, SCOPED_ROLES }
export type { OrgRole, ScopedRole }

/**
 * Who is asking, and what they are in this organisation.
 *
 * Assembled by whoever handles the request — Phase 1 — from
 * `organization.members`, `project.members` and `organization.team_members`.
 * This layer takes it as given so that deciding *what someone may do* stays
 * testable without a database.
 *
 * System-level RBAC is deliberately absent. It is a separate layer that
 * crosses organisations, its permissions live in `iam.*` rather than in
 * code, and nothing reads it until Phase 7 — mixing the two here is exactly
 * what docs/01-architecture.md#permission-hierarchy warns against.
 */
export interface Actor {
  userId: string
  orgId: string
  orgRole: OrgRole
  /** projectId → role, for the projects this person has joined. */
  projectRoles?: Readonly<Record<string, ScopedRole>>
  /** teamId → role. */
  teamRoles?: Readonly<Record<string, ScopedRole>>
}

/**
 * The actor for the request being handled, from the context the guard filled.
 *
 * Every permission check starts here, so that "who is asking" is answered the
 * same way everywhere rather than assembled by hand at each call site — an
 * `Actor` built from the wrong row is a check that passes for the wrong
 * person, and it looks identical to one that passed correctly.
 *
 * Throws when nothing is acting as a member. That is not defensive padding:
 * a cron job and a seed script have an org and no membership, and the only
 * two answers to "may this job update the organisation" are a lie and an
 * error. Jobs cross orgs on purpose and do not ask this question — see
 * `src/maintenance/`, which is deliberately outside the org-scoping rule.
 *
 * `projectRoles` and `teamRoles` are absent until §4 puts project membership
 * in the context. Absent is the safe direction: every rule that reads them is
 * conditional, and a conditional rule with nothing to match fails closed.
 */
export function actorFromContext(): Actor {
  const { userId, orgId, orgRole } = requireOrgContext()

  if (orgRole === null) {
    throw new Error(
      `No role in organisation ${orgId}. Something with no membership is ` +
        'asking a permission question — a job or a seed, which crosses orgs ' +
        'on purpose and must not route through PermissionService.',
    )
  }

  return { userId, orgId, orgRole }
}

/**
 * The caller as the permission rules should see them for one project.
 *
 * `projectRoles` holds that project alone. Loading every project a person is
 * in to answer a question about one of them would be the double load the
 * `@RequirePermission` decorator refuses to do in a guard — and a map with
 * other ids in it invites a rule to match the wrong one.
 *
 * Here rather than beside the service that first needed it, because tasks ask
 * the same question about their project and the two answers must not drift:
 * one of them building the actor slightly differently is a check that passes
 * for the wrong person and looks exactly like one that passed correctly.
 */
export function actorForProject(
  role: ScopedRole | null,
  projectId: string,
): Actor {
  const actor = actorFromContext()

  return role === null
    ? actor
    : { ...actor, projectRoles: { [projectId]: role } }
}
