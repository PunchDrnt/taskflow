import { Module } from '@nestjs/common'

import { provideOrgRepository } from '#shared/org-scope/org-repository.provider'

import { AuditModule } from '../audit/audit.module'
import { UserModule } from '../iam/user/user.module'
import { OrganizationModule } from '../organization/organization.module'
import { TaskModule } from '../task/task.module'
import { ProjectMember } from './project-member.entity'
import { ProjectMemberService } from './project-member.service'
import { ProjectController } from './project.controller'
import { Project } from './project.entity'
import { ProjectService } from './project.service'
import { StatusController } from './status.controller'
import { Status } from './status.entity'
import { StatusService } from './status.service'

/**
 * Projects, their members and their statuses.
 *
 * Statuses live here rather than in a module of their own because they have no
 * life apart from a project: they are created with one, deleted with one, and
 * every question about them is scoped by `project_id`. Sprints are Phase 2 and
 * will land in this module for the same reason.
 *
 * `TaskModule` is imported for the two questions the status rules turn on —
 * how many tasks are in a status, and reconciling their completion when what
 * that status counts as changes. Both are about `task.tasks`, which is not
 * this module's table.
 *
 * `PermissionService` is global (`PermissionModule`), so it is injected
 * without being imported here. `OrganizationModule` is imported for one
 * question — "is this person in the organisation at all" — which
 * `ProjectMemberService` must ask before writing a project membership, and
 * must not answer by reading organization's tables itself.
 */
@Module({
  imports: [AuditModule, OrganizationModule, TaskModule, UserModule],
  controllers: [ProjectController, StatusController],
  providers: [
    provideOrgRepository(Project),
    provideOrgRepository(ProjectMember),
    provideOrgRepository(Status),
    ProjectService,
    ProjectMemberService,
    StatusService,
  ],
})
export class ProjectModule {}
