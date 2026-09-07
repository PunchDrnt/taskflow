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
  /**
   * Somebody's membership of the organisation — the row, not the person. It
   * is a subject of its own rather than part of `Organization` because the
   * two have different answers for an admin: an admin manages the people in
   * an org and cannot dispose of the org itself.
   */
  'Member',
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

    // ...and "who owns it" is these two rules, which is why a membership is
    // its own subject. An admin runs the org's people — inviting, promoting
    // to admin, demoting to member — but ownership is the one thing they
    // cannot hand out or take away. Both directions are needed: an admin who
    // could only be stopped from promoting would still demote every owner and
    // leave nobody able to promote anyone back.
    //
    // The resource is the membership row with the request's intent attached:
    // `role` is what it is now, `newRole` is what the caller asked for.
    cannot('update', 'Member', { role: 'owner' })
    cannot('update', 'Member', { newRole: 'owner' })
  }

  if (actor.orgRole === 'member') {
    // The organisation, its people, its teams: a member may read all of it.
    can('read', 'all')

    // 🔒 ...but not every project, and not every task. `read all` on its own
    // said they could, which contradicts
    // docs/04-features/phase-1.md#สิทธิ์ระดับ-project-กั้นจริงตั้งแต่-phase-1 —
    // a member sees only the projects they have joined. Nothing noticed while
    // no endpoint asked: `ProjectService.list` gates correctly in SQL, and the
    // `can()` beside it was answering yes to everything, so the check read
    // like a check and was not one.
    //
    // These are taken away here and given back per project by the loop below,
    // which is the order CASL needs: the last rule matching a subject wins, so
    // a `can` on one project id overrides this blanket `cannot`.
    cannot('read', 'Project')
    cannot('read', 'Task')

    // ⚠️ **A member may not create a project**, and this used to say the
    // opposite — `can('create', 'Project')`, on the reasoning that a project
    // is a Slack channel and anyone may start one. The specification says
    // otherwise and always did (docs/04-features/phase-1.md#project: "สร้าง
    // project ได้เฉพาะ org owner / admin"), for a reason that only shows up at
    // this company's size: at ~100 people and four projects, letting everyone
    // start one means projects appear that nobody is responsible for tidying
    // away. It also pairs with the rule right below — a member sees only the
    // projects they are in, so the person deciding a new one is needed would
    // be deciding it without being able to see what already exists.
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
