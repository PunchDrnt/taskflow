import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import {
  createTaskSchema,
  projectIdSchema,
  type CreateTaskInput,
} from '@repo/shared'

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

  @Get()
  @ApiOperation({ summary: "This project's tasks, in board order" })
  async list(
    @Param('projectId', new ZodValidationPipe(projectIdSchema))
    projectId: string,
  ): Promise<TaskResponse[]> {
    return withAssignees(this.users, await this.tasks.list(projectId))
  }

  /** Quick add: a title is the only required field. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'File a task in this project' })
  async create(
    @Param('projectId', new ZodValidationPipe(projectIdSchema))
    projectId: string,
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput,
  ): Promise<TaskResponse> {
    const created = await this.tasks.create(projectId, body)

    return (await withAssignees(this.users, [created]))[0]!
  }
}
