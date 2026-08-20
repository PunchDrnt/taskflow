import type { DataSourceOptions } from 'typeorm'

import { AuditLog } from '../modules/audit/log.entity'
import { AiUsage } from '../modules/billing/ai-usage.entity'
import { AiWallet } from '../modules/billing/ai-wallet.entity'
import { Plan } from '../modules/billing/plan.entity'
import { Subscription } from '../modules/billing/subscription.entity'
import { Attachment } from '../modules/discussion/attachment.entity'
import { Comment } from '../modules/discussion/comment.entity'
import { FieldDefinition } from '../modules/field/field-definition.entity'
import { PasswordResetToken } from '../modules/identity/password-reset-token.entity'
import { Session } from '../modules/identity/session.entity'
import { SystemPermission } from '../modules/identity/system-permission.entity'
import { SystemRolePermission } from '../modules/identity/system-role-permission.entity'
import { SystemRole } from '../modules/identity/system-role.entity'
import { SystemUserRole } from '../modules/identity/system-user-role.entity'
import { User } from '../modules/identity/user.entity'
import { Outbox } from '../modules/notify/outbox.entity'
import { OrganizationMember } from '../modules/organization/member.entity'
import { Organization } from '../modules/organization/organization.entity'
import { TeamMember } from '../modules/organization/team-member.entity'
import { Team } from '../modules/organization/team.entity'
import { ProjectMember } from '../modules/project/project-member.entity'
import { Project } from '../modules/project/project.entity'
import { Sprint } from '../modules/project/sprint.entity'
import { Status } from '../modules/project/status.entity'
import { Assignee } from '../modules/task/assignee.entity'
import { Task } from '../modules/task/task.entity'
import { ViewColumn } from '../modules/view/view-column.entity'
import { View } from '../modules/view/view.entity'

/**
 * TypeORM types `entities` as `MixedList<T>`, which is `T[] | Record<string, T>`.
 * The record branch makes `entities.length` an index lookup rather than an array
 * length, so narrow to the array form here — otherwise every consumer has to.
 */
type EntityList = Extract<
  NonNullable<DataSourceOptions['entities']>,
  readonly unknown[]
>

/**
 * Every entity TypeORM should know about, listed explicitly.
 *
 * A `*.entity.js` glob would be shorter, but it resolves differently under
 * `nest build` (CommonJS, `__dirname` in `dist/`) than under Vitest's SWC
 * transform, which is exactly the kind of difference that shows up as an
 * "entity metadata not found" error in one runner and not the other. The
 * cost is one line per entity; the benefit is that the list is greppable
 * and behaves identically everywhere.
 *
 * `test/schema-drift.spec.ts` asserts this list matches what the migrations
 * built, so an entity that is added here but not migrated fails the suite.
 *
 * One per table, `chat.*` aside — those tables arrive in Phase 2.
 */
export const entities: EntityList = [
  // identity — outside org scoping entirely
  User,
  Session,
  PasswordResetToken,
  SystemRole,
  SystemPermission,
  SystemRolePermission,
  SystemUserRole,
  // organization
  Organization,
  OrganizationMember,
  Team,
  TeamMember,
  // project
  Project,
  ProjectMember,
  Status,
  Sprint,
  // task
  Task,
  Assignee,
  // audit — the one entity with no base class
  AuditLog,
  // discussion (Phase 3)
  Comment,
  Attachment,
  // field, view (Phase 4)
  FieldDefinition,
  View,
  ViewColumn,
  // notify
  Outbox,
  // billing — reserved until Phase 7
  Plan,
  Subscription,
  AiWallet,
  AiUsage,
]
