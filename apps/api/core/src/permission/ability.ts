import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
} from '@casl/ability'

import type { Actor } from './actor'

export const ACTIONS = ['manage', 'create', 'read', 'update', 'delete'] as const
export type Action = (typeof ACTIONS)[number]

export const SUBJECTS = [
  'all',
  'Organization',
  'Team',
  'Project',
  'Task',
] as const
export type Subject = (typeof SUBJECTS)[number]

export type AppAbility = MongoAbility<[Action, Subject | object]>

/**
 * What this person may do, as rules rather than scattered `if` statements.
 *
 * A skeleton on purpose: it encodes the role hierarchy the specification
 * already fixes, and nothing feature-specific, because the features are not
 * written. Adding a rule here is how a Phase 1 endpoint gets its check —
 * `ability.can('update', subject)` — rather than by reading `orgRole` at the
 * call site, which is how two endpoints end up disagreeing.
 *
 * Nothing here knows about organisations other than the actor's own: crossing
 * orgs is the scoping layer's job, and this runs after it.
 *
 * See docs/01-architecture.md#permission-hierarchy
 */
export function defineAbilityFor(actor: Actor): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(
    createMongoAbility,
  )

  if (actor.orgRole === 'owner') {
    can('manage', 'all')
  }

  if (actor.orgRole === 'admin') {
    can('manage', 'all')
    // The two things that separate an admin from an owner: an admin cannot
    // dispose of the organisation, or change who owns it.
    cannot('delete', 'Organization')
    cannot('update', 'Organization')
  }

  if (actor.orgRole === 'member') {
    can('read', 'all')
    // A project is a Slack channel, not a department: anyone in the org may
    // start one, and creating it makes them its admin.
    can('create', 'Project')
  }

  for (const [projectId, role] of Object.entries(actor.projectRoles ?? {})) {
    can('read', 'Project', { id: projectId })
    can(['create', 'read', 'update'], 'Task', { projectId })

    if (role === 'admin') {
      can('manage', 'Project', { id: projectId })
      can('manage', 'Task', { projectId })
    }
  }

  for (const [teamId, role] of Object.entries(actor.teamRoles ?? {})) {
    can('read', 'Team', { id: teamId })
    if (role === 'admin') can('manage', 'Team', { id: teamId })
  }

  return build()
}
