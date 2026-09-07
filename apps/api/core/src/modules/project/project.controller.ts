import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import {
  createProjectSchema,
  listProjectsQuerySchema,
  projectIdSchema,
  type CreateProjectInput,
  type ListProjectsQuery,
} from '@repo/shared'

import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'

import { ProjectService, type ProjectView } from './project.service'

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
  constructor(private readonly projects: ProjectService) {}

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
}
