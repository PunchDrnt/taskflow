import { Module } from '@nestjs/common'

import { provideOrgRepository } from '#shared/org-scope/org-repository.provider'

import { AuditModule } from '../audit/audit.module'
import { UserModule } from '../iam/user/user.module'
import { OrganizationModule } from '../organization/organization.module'
import { ProjectMember } from './project-member.entity'
import { ProjectMemberService } from './project-member.service'
import { ProjectController } from './project.controller'
import { Project } from './project.entity'
import { ProjectService } from './project.service'
import { Status } from './status.entity'

/**
 * Projects, their members and their statuses.
 *
 * Statuses live here rather than in a module of their own because they have no
 * life apart from a project: they are created with one, deleted with one, and
 * every question about them is scoped by `project_id`. Sprints are Phase 2 and
 * will land in this module for the same reason.
 *
 * `PermissionService` is global (`PermissionModule`), so it is injected
 * without being imported here. `OrganizationModule` is imported for one
 * question — "is this person in the organisation at all" — which
 * `ProjectMemberService` must ask before writing a project membership, and
 * must not answer by reading organization's tables itself.
 */
@Module({
  imports: [AuditModule, OrganizationModule, UserModule],
  controllers: [ProjectController],
  providers: [
    provideOrgRepository(Project),
    provideOrgRepository(ProjectMember),
    provideOrgRepository(Status),
    ProjectService,
    ProjectMemberService,
  ],
})
export class ProjectModule {}
