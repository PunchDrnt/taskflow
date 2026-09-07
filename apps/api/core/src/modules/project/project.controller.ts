import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import {
  addProjectMemberSchema,
  changeProjectMemberRoleSchema,
  createProjectSchema,
  listProjectsQuerySchema,
  projectIdSchema,
  projectMemberUserIdSchema,
  updateProjectSchema,
  type AddProjectMemberInput,
  type ChangeProjectMemberRoleInput,
  type CreateProjectInput,
  type ListProjectsQuery,
  type UpdateProjectInput,
} from '@repo/shared'

import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'

import { UserService } from '../iam/user/user.service'
import {
  ProjectMemberService,
  type ProjectMemberRow,
} from './project-member.service'
import { ProjectService, type ProjectView } from './project.service'

/** A project member as the members panel draws them. */
interface ProjectMemberView extends ProjectMemberRow {
  /** Null when the account has been anonymised but the membership remains. */
  name: string | null
  nickname: string | null
  email: string | null
  avatarUrl: string | null
}

/**
 * Projects in the organisation this request is acting for.
 *
 * Plural and id-bearing, unlike `/org` — an organisation has one of itself and
 * the active one is settled by a cookie, while a person works across several
 * projects in the same session and has to name which.
 *
 * No `@RequirePermission` anywhere in this controller, and that is the design
 * rather than an omission. Every question here is about a row: which projects
 * this caller may see, whether they may touch *this* one. A guard runs before
 * the handler and has loaded nothing, so it could only re-fetch what the
 * service is about to fetch — see `ContextResolvedSubject`, which is why
 * `@RequirePermission('update', 'Project')` does not compile.
 */
@ApiTags('project')
@Controller('projects')
export class ProjectController {
  constructor(
    private readonly projects: ProjectService,
    private readonly members: ProjectMemberService,
    private readonly users: UserService,
  ) {}

  /**
   * Not every project in the organisation — every project *this caller* may
   * see, decided in the query. See `ProjectService.list`.
   */
  @Get()
  @ApiOperation({ summary: 'The projects this caller may see' })
  list(
    @Query(new ZodValidationPipe(listProjectsQuerySchema))
    query: ListProjectsQuery,
  ): Promise<ProjectView[]> {
    return this.projects.list(query)
  }

  /** 404 rather than 403 when the caller may not see it — see the service. */
  @Get(':id')
  @ApiOperation({ summary: 'One project' })
  find(
    @Param('id', new ZodValidationPipe(projectIdSchema)) id: string,
  ): Promise<ProjectView> {
    return this.projects.findById(id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a project, with its starting statuses' })
  create(
    @Body(new ZodValidationPipe(createProjectSchema))
    body: CreateProjectInput,
  ): Promise<ProjectView> {
    return this.projects.create(body)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a project, or change its colour or prefix' })
  update(
    @Param('id', new ZodValidationPipe(projectIdSchema)) id: string,
    @Body(new ZodValidationPipe(updateProjectSchema))
    body: UpdateProjectInput,
  ): Promise<ProjectView> {
    return this.projects.update(id, body)
  }

  /**
   * Archiving is its own endpoint rather than a field on `PATCH`, so that
   * hiding a project from everyone's sidebar cannot arrive as a rename with
   * one extra key — and so the activity log gets an entry somebody can scan
   * for. `DELETE` on the same path is the way back.
   */
  @Post(':id/archive')
  // 200, not Nest's POST default of 201: nothing is created, and the body is
  // the project as it now stands.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hide the project from sidebars and pickers' })
  archive(
    @Param('id', new ZodValidationPipe(projectIdSchema)) id: string,
  ): Promise<ProjectView> {
    return this.projects.setArchived(id, true)
  }

  @Delete(':id/archive')
  @ApiOperation({ summary: 'Bring an archived project back' })
  unarchive(
    @Param('id', new ZodValidationPipe(projectIdSchema)) id: string,
  ): Promise<ProjectView> {
    return this.projects.setArchived(id, false)
  }

  /** Takes the statuses, sprints, tasks and everything under them with it. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a project and everything in it' })
  remove(
    @Param('id', new ZodValidationPipe(projectIdSchema)) id: string,
  ): Promise<void> {
    return this.projects.remove(id)
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Who is in this project' })
  async listMembers(
    @Param('id', new ZodValidationPipe(projectIdSchema)) id: string,
  ): Promise<ProjectMemberView[]> {
    const members = await this.members.list(id)

    // Names come from iam through its service, never from a join: this module
    // does not own `iam.users`, and the assignee picker will want the same
    // shape. Same arrangement as the organisation's members list.
    const people = await this.users.findByIds(
      members.map((member) => member.userId),
    )
    const byId = new Map(people.map((person) => [person.id, person]))

    return members.map((member) => {
      const person = byId.get(member.userId)

      return {
        ...member,
        name: person?.name ?? null,
        nickname: person?.nickname ?? null,
        email: person?.email ?? null,
        avatarUrl: person?.avatarUrl ?? null,
      }
    })
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add somebody in this organisation to the project' })
  addMember(
    @Param('id', new ZodValidationPipe(projectIdSchema)) id: string,
    @Body(new ZodValidationPipe(addProjectMemberSchema))
    body: AddProjectMemberInput,
  ): Promise<ProjectMemberRow> {
    return this.members.add(id, body.userId, body.role)
  }

  @Patch(':id/members/:userId')
  @ApiOperation({ summary: "Change somebody's role in this project" })
  changeMemberRole(
    @Param('id', new ZodValidationPipe(projectIdSchema)) id: string,
    @Param('userId', new ZodValidationPipe(projectMemberUserIdSchema))
    userId: string,
    @Body(new ZodValidationPipe(changeProjectMemberRoleSchema))
    body: ChangeProjectMemberRoleInput,
  ): Promise<ProjectMemberRow> {
    return this.members.changeRole(id, userId, body.role)
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Take somebody out of the project' })
  removeMember(
    @Param('id', new ZodValidationPipe(projectIdSchema)) id: string,
    @Param('userId', new ZodValidationPipe(projectMemberUserIdSchema))
    userId: string,
  ): Promise<void> {
    return this.members.remove(id, userId)
  }
}
