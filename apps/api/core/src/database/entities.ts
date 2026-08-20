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

/** `MixedList<T>` is `T[] | Record<string, T>`; narrow it once, here. */
type EntityList = Extract<
  NonNullable<DataSourceOptions['entities']>,
  readonly unknown[]
>

/**
 * Listed explicitly rather than by glob: a `*.entity.js` glob resolves
 * differently under `nest build` than under Vitest's SWC transform, and the
 * difference surfaces as "entity metadata not found" in one runner only.
 *
 * `test/schema-drift.spec.ts` holds this list and the migrations together.
 * One per table, `chat.*` aside — Phase 2.
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
