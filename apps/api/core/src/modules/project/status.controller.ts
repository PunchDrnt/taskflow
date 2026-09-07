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
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import {
  createStatusSchema,
  projectIdSchema,
  statusIdSchema,
  updateStatusSchema,
  type CreateStatusInput,
  type UpdateStatusInput,
} from '@repo/shared'

import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'

import { StatusService, type StatusView } from './status.service'

/**
 * The columns on one project's board.
 *
 * Nested under the project because a status has no life without one — it is
 * created with a project, deleted with it, and every question about it is
 * scoped by `project_id`. A flat `/v1/statuses/:id` would hide that, and would
 * make "which project's board is this" something the body has to carry.
 *
 * Whether the caller may touch any of it is settled inside the service, which
 * asks the project first: seeing it is 404, changing it is 403.
 */
@ApiTags('project')
@Controller('projects/:projectId/statuses')
export class StatusController {
  constructor(private readonly statuses: StatusService) {}

  @Get()
  @ApiOperation({ summary: "This project's statuses, in board order" })
  list(
    @Param('projectId', new ZodValidationPipe(projectIdSchema))
    projectId: string,
  ): Promise<StatusView[]> {
    return this.statuses.list(projectId)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a status to the end of the board' })
  create(
    @Param('projectId', new ZodValidationPipe(projectIdSchema))
    projectId: string,
    @Body(new ZodValidationPipe(createStatusSchema))
    body: CreateStatusInput,
  ): Promise<StatusView> {
    return this.statuses.create(projectId, body)
  }

  /**
   * Rename, recolour, re-type, reorder or make default — the settings screen
   * edits all of these in one grid, so they arrive as one PATCH rather than
   * five endpoints.
   *
   * Position is `afterId`, the neighbour to sit behind, never the sort key
   * itself: see `updateStatusSchema`.
   */
  @Patch(':statusId')
  @ApiOperation({ summary: 'Change a status, or move it' })
  update(
    @Param('projectId', new ZodValidationPipe(projectIdSchema))
    projectId: string,
    @Param('statusId', new ZodValidationPipe(statusIdSchema)) statusId: string,
    @Body(new ZodValidationPipe(updateStatusSchema))
    body: UpdateStatusInput,
  ): Promise<StatusView> {
    return this.statuses.update(projectId, statusId, body)
  }

  @Delete(':statusId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a status the project can spare' })
  remove(
    @Param('projectId', new ZodValidationPipe(projectIdSchema))
    projectId: string,
    @Param('statusId', new ZodValidationPipe(statusIdSchema)) statusId: string,
  ): Promise<void> {
    return this.statuses.remove(projectId, statusId)
  }
}
