/** Fixed in code, not rows in a table: there are three and they never grow. */
export const ORG_ROLES = ['owner', 'admin', 'member'] as const
export type OrgRole = (typeof ORG_ROLES)[number]

/** Teams and projects have two. A "deputy lead" is just another admin. */
export const SCOPED_ROLES = ['admin', 'member'] as const
export type ScopedRole = (typeof SCOPED_ROLES)[number]

/**
 * Who is asking, and what they are in this organisation.
 *
 * Assembled by whoever handles the request — Phase 1 — from
 * `organization.members`, `project.members` and `organization.team_members`.
 * This layer takes it as given so that deciding *what someone may do* stays
 * testable without a database.
 *
 * System-level RBAC is deliberately absent. It is a separate layer that
 * crosses organisations, its permissions live in `identity.*` rather than in
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
