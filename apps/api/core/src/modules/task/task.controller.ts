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
  assignTaskSchema,
  myTasksQuerySchema,
  projectMemberUserIdSchema,
  taskIdSchema,
  updateTaskSchema,
  wholeList,
  type AssignTaskInput,
  type MyTasksQuery,
  type Page,
  type UpdateTaskInput,
} from '@repo/shared'

import { ApiZodBody, ApiZodQuery } from '#shared/http/api-zod'
import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'

import { UserService } from '../iam/user/user.service'
import {
  namesFor,
  withAssignees,
  type AssigneeView,
  type TaskResponse,
} from './task-people'
import { TaskService, type TaskView } from './task.service'

/** One line of a task's activity panel. */
export interface ActivityEntry {
  id: string
  action: string
  occurredAt: Date
  changes: Record<string, unknown>
  actor: AssigneeView
}

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

  /**
   * My Tasks — everything assigned to the caller, across every project they
   * can see.
   *
   * Declared before `:taskId`, or Nest would match `/tasks` against nothing
   * and `/tasks?…` against this anyway — but the ordering matters the moment
   * another literal segment is added here, and it costs nothing to keep the
   * specific routes above the parameterised one.
   *
   * Closed statuses are hidden unless `includeClosed=true`.
   */
  @Get()
  @ApiOperation({ summary: 'Tasks assigned to me' })
  @ApiZodQuery(myTasksQuerySchema)
  async mine(
    @Query(new ZodValidationPipe(myTasksQuerySchema)) query: MyTasksQuery,
  ): Promise<Page<TaskResponse>> {
    const page = await this.tasks.myTasks(query)

    return { ...page, data: await withAssignees(this.users, page.data) }
  }

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
  @ApiZodBody(updateTaskSchema)
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

  /**
   * The task's history, newest first — the activity panel on the detail view.
   *
   * Actor names are attached the same way assignees' are: from `iam` through
   * its service, never a join.
   */
  @Get(':taskId/activity')
  @ApiOperation({ summary: 'What has happened to this task' })
  async activity(
    @Param('taskId', new ZodValidationPipe(taskIdSchema)) taskId: string,
  ): Promise<Page<ActivityEntry>> {
    const rows = await this.tasks.activity(taskId)
    const actors = await this.people(rows.map((row) => row.actorId))
    const byId = new Map(actors.map((actor) => [actor.userId, actor]))

    return wholeList(
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        occurredAt: row.occurredAt,
        changes: row.changesJson,
        actor: byId.get(row.actorId) ?? {
          userId: row.actorId,
          name: null,
          nickname: null,
          avatarUrl: null,
        },
      })),
    )
  }

  @Get(':taskId/assignees')
  @ApiOperation({ summary: 'Who has this task' })
  async listAssignees(
    @Param('taskId', new ZodValidationPipe(taskIdSchema)) taskId: string,
  ): Promise<Page<AssigneeView>> {
    return wholeList(await this.people(await this.tasks.listAssignees(taskId)))
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
  @ApiZodBody(assignTaskSchema)
  async assign(
    @Param('taskId', new ZodValidationPipe(taskIdSchema)) taskId: string,
    @Body(new ZodValidationPipe(assignTaskSchema)) body: AssignTaskInput,
  ): Promise<Page<AssigneeView>> {
    return wholeList(await this.people(await this.tasks.assign(taskId, body)))
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
