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
  createTaskSchema,
  listTasksQuerySchema,
  projectIdSchema,
  type CreateTaskInput,
  type ListTasksQuery,
  type Page,
} from '@repo/shared'

import { ApiZodBody, ApiZodQuery } from '#shared/http/api-zod'
import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'

import { UserService } from '../iam/user/user.service'
import { withAssignees, type TaskResponse } from './task-people'
import { TaskService } from './task.service'

/**
 * The two task routes that need a project to make sense: the board, and
 * filing something new on it.
 *
 * Everything else lives at `/v1/tasks/:taskId`, because a task's id is enough
 * to find it and its key travels on its own — people paste `DEV-120` into
 * chat. Nesting the whole resource would make every one of those links carry a
 * project id the reader does not have.
 */
@ApiTags('task')
@Controller('projects/:projectId/tasks')
export class ProjectTaskController {
  constructor(
    private readonly tasks: TaskService,
    private readonly users: UserService,
  ) {}

  /**
   * The board and the list view read the same rows; the query string is what
   * separates them. Filters are ANDed, several values in one filter is "is
   * in", and paging is a cursor — see `listTasksQuerySchema`.
   */
  @Get()
  @ApiOperation({ summary: "This project's tasks, filtered and paged" })
  @ApiZodQuery(listTasksQuerySchema)
  async list(
    @Param('projectId', new ZodValidationPipe(projectIdSchema))
    projectId: string,
    @Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQuery,
  ): Promise<Page<TaskResponse>> {
    const page = await this.tasks.list(projectId, query)

    return { ...page, data: await withAssignees(this.users, page.data) }
  }

  /** Quick add: a title is the only required field. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'File a task in this project' })
  @ApiZodBody(createTaskSchema)
  async create(
    @Param('projectId', new ZodValidationPipe(projectIdSchema))
    projectId: string,
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput,
  ): Promise<TaskResponse> {
    const created = await this.tasks.create(projectId, body)

    return (await withAssignees(this.users, [created]))[0]!
  }
}
