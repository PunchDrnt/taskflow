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
  assignTaskSchema,
  projectMemberUserIdSchema,
  taskIdSchema,
  updateTaskSchema,
  type AssignTaskInput,
  type UpdateTaskInput,
} from '@repo/shared'

import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'

import { UserService } from '../iam/user/user.service'
import {
  namesFor,
  withAssignees,
  type AssigneeView,
  type TaskResponse,
} from './task-people'
import { TaskService, type TaskView } from './task.service'

/**
 * One task, by id.
 *
 * Flat rather than under its project, because a task never moves between
 * projects (docs/04-features/phase-1.md#task-key) and its id is enough to find
 * it — a link to `DEV-120` should not have to carry a project id the person
 * pasting it does not have.
 *
 * No `@RequirePermission` anywhere here, deliberately: whether the caller may
 * touch a task depends on the project it is in, which is not known until the
 * row is loaded. The decorator's `ContextResolvedSubject` refuses to express
 * that on purpose — the check lives in `TaskService.requireTask`, after the
 * load, where it can be answered honestly.
 */
@ApiTags('task')
@Controller('tasks')
export class TaskController {
  constructor(
    private readonly tasks: TaskService,
    private readonly users: UserService,
  ) {}

  @Get(':taskId')
  @ApiOperation({ summary: 'One task' })
  async findOne(
    @Param('taskId', new ZodValidationPipe(taskIdSchema)) taskId: string,
  ): Promise<TaskResponse> {
    return this.one(await this.tasks.findById(taskId))
  }

  /**
   * Edit, re-prioritise, re-schedule, move between columns, or reorder within
   * one — the detail panel and a board drag both land here.
   *
   * Position is `afterId`, the neighbour to sit behind, never the sort key
   * itself: see `updateTaskSchema`.
   */
  @Patch(':taskId')
  @ApiOperation({ summary: 'Change a task, or move it' })
  async update(
    @Param('taskId', new ZodValidationPipe(taskIdSchema)) taskId: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskInput,
  ): Promise<TaskResponse> {
    return this.one(await this.tasks.update(taskId, body))
  }

  /** Takes its sub-tasks, comments and attachments with it. The number stays spent. */
  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task and everything under it' })
  remove(
    @Param('taskId', new ZodValidationPipe(taskIdSchema)) taskId: string,
  ): Promise<void> {
    return this.tasks.remove(taskId)
  }

  @Get(':taskId/assignees')
  @ApiOperation({ summary: 'Who has this task' })
  async listAssignees(
    @Param('taskId', new ZodValidationPipe(taskIdSchema)) taskId: string,
  ): Promise<AssigneeView[]> {
    return this.people(await this.tasks.listAssignees(taskId))
  }

  /**
   * Give the task to somebody.
   *
   * Assigning a person who is not in the project answers 409
   * `NOT_PROJECT_MEMBER` rather than adding them: the client asks first, then
   * repeats the request with `addToProject: true`.
   */
  @Post(':taskId/assignees')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign somebody to this task' })
  async assign(
    @Param('taskId', new ZodValidationPipe(taskIdSchema)) taskId: string,
    @Body(new ZodValidationPipe(assignTaskSchema)) body: AssignTaskInput,
  ): Promise<AssigneeView[]> {
    return this.people(await this.tasks.assign(taskId, body))
  }

  /** Takes the task off them. They stay in the project. */
  @Delete(':taskId/assignees/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unassign somebody from this task' })
  async unassign(
    @Param('taskId', new ZodValidationPipe(taskIdSchema)) taskId: string,
    @Param('userId', new ZodValidationPipe(projectMemberUserIdSchema))
    userId: string,
  ): Promise<void> {
    await this.tasks.unassign(taskId, userId)
  }

  private async one(task: TaskView): Promise<TaskResponse> {
    return (await withAssignees(this.users, [task]))[0]!
  }

  private people(assigneeIds: string[]): Promise<AssigneeView[]> {
    return namesFor(this.users, assigneeIds)
  }
}
