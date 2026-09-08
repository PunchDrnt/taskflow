import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import {
  DataSource,
  QueryFailedError,
  type EntityManager,
  type SelectQueryBuilder,
} from 'typeorm'

import {
  TASK_ERROR_CODES,
  wholeList,
  type AssignTaskInput,
  type CreateTaskInput,
  type ListTasksQuery,
  type MyTasksQuery,
  type Page,
  type TaskPriority,
  type TaskSortField,
  type UpdateTaskInput,
} from '@repo/shared'

import { CascadeSoftDelete } from '#shared/entity/cascade-soft-delete'
import { ApiException } from '#shared/http/api-exception'
import { decodeCursor, toPage } from '#shared/http/cursor'
import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { requireOrgContext } from '#shared/org-scope/request-context'
import { between } from '#shared/sort-order'

import type { Env } from '../../config/env'
import type { Action } from '../../permission/ability'
import { actorForProject } from '../../permission/actor'
import { PermissionService } from '../../permission/permission.service'
import { AuditService } from '../audit/audit.service'
import { changesBetween } from '../audit/changes'
import type { AuditLog } from '../audit/log.entity'
import { ACTIVE_USER_STATUS, UserService } from '../iam/user/user.service'
import { EmailService } from '../notify/email.service'
import { ProjectMemberService } from '../project/project-member.service'
import { Project } from '../project/project.entity'
import { ProjectService } from '../project/project.service'
import { StatusService } from '../project/status.service'
import { Assignee } from './assignee.entity'
import { Task } from './task.entity'

/** A task as a board card, a list row or a detail panel needs it. */
export interface TaskView {
  id: string
  projectId: string
  /** `DEV-120`, assembled here — never stored. See `ProjectService.allocateTaskNumber`. */
  key: string
  number: number
  title: string
  description: string | null
  statusId: string
  priority: TaskPriority | null
  dueDate: Date | null
  sortOrder: string
  completedAt: Date | null
  completedBy: string | null
  /** Ids only; the controller attaches names through `UserService`. */
  assigneeIds: string[]
}

const UNIQUE_VIOLATION = '23505'

/**
 * How each sort is expressed in SQL, and how its value is cast back when a
 * cursor resumes from it.
 *
 * 🔒 **Every expression here is NOT NULL, and that is the whole design.** A
 * keyset cursor resumes with a row comparison, and `(a, b) > (NULL, c)`
 * evaluates to NULL rather than true — so a nullable ordering column returns
 * an empty page instead of the next one, with no error to notice. `due_date`
 * and `priority` are both nullable columns, and both are questions the list
 * view exists to answer, so they are made total here rather than left out:
 *
 * - a task with no due date sorts as `infinity`, which is where "no deadline"
 *   belongs when the list is "what is due first";
 * - priority becomes a rank, so `urgent` and `low` order by what they mean
 *   rather than alphabetically, where `high` would sit between them.
 */
const TASK_SORTS: Record<TaskSortField, { sql: string; cast: string }> = {
  order: { sql: 'task.sort_order', cast: 'text' },
  dueDate: { sql: "COALESCE(task.due_date, 'infinity')", cast: 'timestamptz' },
  priority: {
    sql: `CASE task.priority
            WHEN 'urgent' THEN 4 WHEN 'high' THEN 3
            WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END`,
    cast: 'int',
  },
  created: { sql: 'task.created_at', cast: 'timestamptz' },
  title: { sql: 'task.title', cast: 'text' },
}

/** The task, its project, and what the caller is in that project. */
interface TaskContext {
  task: Task
  project: Project
  assigneeIds: string[]
}

/**
 * The work itself.
 *
 * Every method starts from the project, because that is where a task's
 * permissions live: `ability.ts` grants `Task` rights per `projectId`, so
 * seeing the project is what makes the task visible and the project role is
 * what decides whether it may be changed. Two rules follow from that and are
 * worth stating before reading any single method:
 *
 * - **A task nobody may see is a 404, a task they may see and not change is a
 *   403** — the split `ProjectService.findVisible` draws, applied one level
 *   down.
 * - **An archived project is read-only.** Archiving is not deleting; the
 *   specification keeps history readable and takes the project out of the
 *   sidebar and out of every picker. A project that still accepts new work
 *   after being archived is one that was never really archived.
 */
@Injectable()
export class TaskService {
  constructor(
    @InjectOrgRepository(Task)
    private readonly tasks: OrgScopedRepository<Task>,
    @InjectOrgRepository(Assignee)
    private readonly assignees: OrgScopedRepository<Assignee>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly projects: ProjectService,
    private readonly members: ProjectMemberService,
    private readonly statuses: StatusService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    private readonly cascade: CascadeSoftDelete,
    private readonly users: UserService,
    private readonly email: EmailService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true })
  }

  /** Where a task lives on the web, for the link in an assignment email. */
  private readonly appUrl: string

  /**
   * One project's tasks — the board, and the list view over the same rows.
   *
   * Closed statuses are *not* hidden here: a board draws every column it has,
   * and Done is one of them. Hiding them is My Tasks' default, where the
   * question being asked is different.
   */
  async list(
    projectId: string,
    query: ListTasksQuery,
  ): Promise<Page<TaskView>> {
    const { project } = await this.projects.findVisible(projectId)

    const builder = this.tasks.queryBuilder
      .withOrg('task')
      .andWhere('task.projectId = :projectId', { projectId })

    return this.paginate(builder, query, () => project)
  }

  /**
   * Everything assigned to the caller, across every project they can see.
   *
   * 🔒 **Project visibility gates this too.** Being assigned is not the same
   * as being able to see: somebody removed from a project keeps the
   * assignment rows, and without this they would go on reading that project's
   * work from a screen nobody thinks of as a project screen. The visible set
   * comes from `ProjectService.list`, which is the one place that rule is
   * written as SQL — replicating its join here would be a third statement of
   * a rule that is already stated twice.
   *
   * Archived projects are excluded, because `list` excludes them by default
   * and the specification says their work does not appear here.
   *
   * `includeClosed` defaults to false: opening this should show what there is
   * to do, not a pile of what has been dealt with.
   */
  async myTasks(query: MyTasksQuery): Promise<Page<TaskView>> {
    const { userId } = requireOrgContext()

    const visible = await this.projects.list()
    const byId = new Map(visible.map((project) => [project.id, project]))

    if (visible.length === 0) return emptyPage()

    const builder = this.tasks.queryBuilder
      .withOrg('task')
      .andWhere('task.projectId IN (:...projectIds)', {
        projectIds: [...byId.keys()],
      })
      .andWhere(assignedTo('mine'), { mine: [userId] })

    if (!query.includeClosed) {
      const closed = await this.statuses.closedStatusIds()

      if (closed.length > 0) {
        builder.andWhere('task.statusId NOT IN (:...closed)', { closed })
      }
    }

    // Non-null: the query is filtered to exactly these project ids.
    return this.paginate(builder, query, (task) => byId.get(task.projectId)!)
  }

  async findById(taskId: string): Promise<TaskView> {
    const { task, project, assigneeIds } = await this.requireTask(
      taskId,
      'read',
    )

    return view(task, project, assigneeIds)
  }

  /**
   * Files a new task.
   *
   * Quick add is the shape this has to fit: a title and nothing else. The
   * status comes from the project's default and the position from the end of
   * that column, so pressing Enter is the whole interaction — see
   * `createTaskSchema`.
   *
   * 🔒 The number and the row are allocated in one transaction. See
   * `ProjectService.allocateTaskNumber` for why the counter lives on the
   * project rather than being derived, and why the `UPDATE` returning it is
   * what makes two simultaneous creates safe.
   */
  async create(projectId: string, input: CreateTaskInput): Promise<TaskView> {
    const { orgId, userId } = requireOrgContext()

    const { project, role } = await this.projects.findVisible(projectId)

    this.permissions.assert(
      actorForProject(role, projectId),
      'create',
      'Task',
      {
        projectId,
      },
    )
    refuseIfArchived(project)

    const status =
      input.statusId === undefined
        ? await this.statuses.defaultStatus(projectId)
        : await this.statuses.requireStatusOfProject(projectId, input.statusId)

    return this.dataSource.transaction(async (manager) => {
      const number = await this.projects.allocateTaskNumber(manager, projectId)

      // Read *after* the number was allocated, which is what holds the lock on
      // the project row: two people quick-adding at once therefore append one
      // behind the other rather than computing the same key from the same
      // last card and landing on top of each other.
      const last = await this.lastInColumn(projectId, status.id, null)

      const row = {
        orgId,
        projectId,
        title: input.title,
        description: input.description ?? null,
        statusId: status.id,
        number,
        priority: input.priority ?? null,
        dueDate: input.dueDate ?? null,
        sortOrder: between(last?.sortOrder ?? null, null),
        // Sub-tasks are Phase 2; everything filed here is a root task, which
        // is what `tasks_depth_matches_parent_check` requires of depth 0.
        parentTaskId: null,
        depth: 0,
        // 🔒 A task created straight into a done status counts as done from
        // the moment it exists. Skipping this because "nobody creates a
        // finished task" is how the invariant breaks on the one screen that
        // does — a board's quick add inside the Done column.
        ...completionFor(
          status.isDoneType,
          { completedAt: null, completedBy: null },
          userId,
        ),
        createdBy: userId,
        updatedBy: userId,
      }

      const inserted = await manager.insert(Task, row)
      const created = { ...(inserted.generatedMaps[0] as Task), ...row }

      await this.audit.record(manager, {
        entityType: 'task',
        entityId: created.id,
        action: 'created',
        changes: {
          title: { from: null, to: row.title },
          number: { from: null, to: number },
          statusId: { from: null, to: status.id },
        },
      })

      return view(created, project, [])
    })
  }

  /**
   * Edits a task, moves it between columns, or moves it within one.
   *
   * 🔒 **The completion columns follow the status, in both directions.** This
   * is direction A of the rule — a task changing status — and its twin lives
   * in `TasksInStatusService.reconcileCompletion`, which handles the status
   * itself changing under tasks already in it. Neither can cover the other,
   * and no CHECK can cover either, because the condition spans `task.tasks`
   * and `project.statuses`.
   *
   * Moving between two statuses that both count as done leaves the original
   * completion date alone: the work finished when it finished, and Done →
   * Shipped is not a second completion.
   */
  async update(taskId: string, patch: UpdateTaskInput): Promise<TaskView> {
    const { userId } = requireOrgContext()

    const { task, project, assigneeIds } = await this.requireTask(
      taskId,
      'update',
    )

    const status =
      patch.statusId === undefined || patch.statusId === task.statusId
        ? null
        : await this.statuses.requireStatusOfProject(
            task.projectId,
            patch.statusId,
          )

    const sortOrder = await this.nextSortOrder(task, status?.id ?? null, patch)

    const after: Task = {
      ...task,
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.description === undefined
        ? {}
        : { description: patch.description }),
      ...(patch.priority === undefined ? {} : { priority: patch.priority }),
      ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
      ...(status === null ? {} : { statusId: status.id }),
      // 🔒 Direction A. Only when the status actually changed: an edit that
      // leaves the column alone must not restamp a completion date.
      ...(status === null
        ? {}
        : completionFor(status.isDoneType, task, userId)),
      sortOrder,
    }

    const changes = changesBetween({ ...task }, { ...after })

    if (Object.keys(changes).length === 0)
      return view(task, project, assigneeIds)

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Task, taskId, {
        title: after.title,
        description: after.description,
        statusId: after.statusId,
        priority: after.priority,
        dueDate: after.dueDate,
        sortOrder: after.sortOrder,
        completedAt: after.completedAt,
        completedBy: after.completedBy,
        updatedBy: userId,
      })

      await this.audit.record(manager, {
        entityType: 'task',
        entityId: taskId,
        action: 'updated',
        changes,
      })
    })

    return view(after, project, assigneeIds)
  }

  /**
   * Soft-deletes the task, its sub-tasks, and their comments and attachments.
   *
   * Through `CascadeSoftDelete` for the reason `ProjectService.remove` gives:
   * `ON DELETE CASCADE` fires only on a hard delete, so without it the
   * children outlive the parent and jam the retention purge months later.
   *
   * The number does not come back. `tasks_project_number_unique` is a full
   * index and `next_task_number` only moves forward, so `DEV-87` stays
   * `DEV-87`'s even once nothing answers to it — which is the point.
   */
  async remove(taskId: string): Promise<void> {
    const { task } = await this.requireTask(taskId, 'delete')

    await this.dataSource.transaction(async (manager) => {
      const deleted = await this.cascade.softDelete(
        manager,
        'task.tasks',
        taskId,
      )

      await this.audit.record(manager, {
        entityType: 'task',
        entityId: taskId,
        action: 'deleted',
        changes: {
          title: { from: task.title, to: null },
          cascaded: { from: null, to: deleted },
        },
      })
    })
  }

  /**
   * Everything that has happened to this task, newest first.
   *
   * Read through `AuditService`, never by joining `audit.logs` — the activity
   * log is a feature owned by one module, and a join from here would freeze
   * its table shape forever (docs/01-architecture.md#reading-the-audit-log-from-other-modules).
   *
   * Seeing the task is the whole requirement: anybody who may open it may see
   * what happened to it.
   */
  async activity(taskId: string): Promise<AuditLog[]> {
    await this.requireTask(taskId, 'read')

    return this.audit.findForEntity('task', taskId)
  }

  /** Who has this task. */
  async listAssignees(taskId: string): Promise<string[]> {
    const { assigneeIds } = await this.requireTask(taskId, 'read')

    return assigneeIds
  }

  /**
   * Gives the task to somebody.
   *
   * Assigning is an edit of the task, so a project member may do it — but
   * *joining someone to the project* is not, and this is where the two meet.
   * Somebody in the organisation who is not in the project is refused with
   * `NOT_PROJECT_MEMBER` rather than pulled in silently: project membership
   * grants every task, comment and attachment in it, and that is not a side
   * effect of picking a name out of a picker. The client asks, then repeats
   * the request with `addToProject: true` — the confirmation
   * docs/04-features/phase-1.md#assignee-picker describes, as a second
   * request rather than a hidden write.
   *
   * The join itself goes through `ProjectMemberService.add`, which brings its
   * own two checks: the caller must be allowed to change the project's
   * membership (a plain member is not), and 🔒 the target must already be in
   * the organisation — the FK does not cover that.
   *
   * The notification is queued **in this transaction**, through
   * `EmailService.enqueue(manager, …)`. An assignment that commits without
   * queuing the mail is somebody who never learns they have work; a mail that
   * goes out for an assignment that then rolled back is worse. Nothing is
   * *sent* here — `OutboxWorker` does that after the commit, because Resend
   * cannot be rolled back.
   *
   * ⚠️ **Assigning yourself sends nothing.** You were there; an email telling
   * you what you just did is the first one people write a filter for, and the
   * filter catches the ones that matter too.
   */
  async assign(taskId: string, input: AssignTaskInput): Promise<string[]> {
    const { orgId, userId } = requireOrgContext()

    const { task, project, assigneeIds } = await this.requireTask(
      taskId,
      'update',
    )

    const target = await this.users.findById(input.userId)

    // docs/04-features/phase-1.md#user-states--three-different-things: a
    // deactivated colleague keeps the work they are already holding — nothing
    // is reassigned on their behalf — but no new work may be put on somebody
    // who can no longer sign in to see it.
    if (target === null || target.status !== ACTIVE_USER_STATUS) {
      throw new ApiException(
        409,
        TASK_ERROR_CODES.USER_INACTIVE,
        'That account is deactivated and cannot be given new work',
      )
    }

    if (!(await this.members.find(task.projectId, input.userId))) {
      if (!input.addToProject) {
        throw new ApiException(
          409,
          TASK_ERROR_CODES.NOT_PROJECT_MEMBER,
          'That person is not in this project yet. Add them to it?',
          { userId: input.userId },
        )
      }

      await this.members.add(task.projectId, input.userId, 'member')
    }

    await this.dataSource.transaction(async (manager) => {
      try {
        await manager.insert(Assignee, {
          orgId,
          taskId,
          // Teams are Phase 2. The column and its CHECK already hold both.
          assigneeType: 'user',
          assigneeId: input.userId,
          createdBy: userId,
        })
      } catch (error) {
        throw alreadyAssigned(error)
      }

      await this.audit.record(manager, {
        entityType: 'task',
        entityId: taskId,
        action: 'assigned',
        // 🔒 `entity_id` is the task, so the person assigned goes in the
        // changes — docs say it plainly, and a log keyed on the assignee
        // would answer "what happened to this task" with nothing.
        changes: { assigneeId: { from: null, to: input.userId } },
      })

      if (input.userId !== userId) {
        await this.announce(manager, task, project, input.userId, userId)
      }
    })

    return [...assigneeIds, input.userId]
  }

  /** Takes the task off somebody. Leaving the project is a separate act. */
  async unassign(taskId: string, userId: string): Promise<string[]> {
    const { assigneeIds } = await this.requireTask(taskId, 'update')

    const row = await this.assignees.queryBuilder
      .withOrg('assignee')
      .andWhere('assignee.taskId = :taskId', { taskId })
      .andWhere("assignee.assigneeType = 'user'")
      .andWhere('assignee.assigneeId = :userId', { userId })
      .getOne()

    if (!row)
      throw ApiException.notFound('That person is not assigned to this task')

    await this.dataSource.transaction(async (manager) => {
      // Before the delete: the audit row names the id, and reading it back
      // afterwards would find nothing.
      await this.audit.record(manager, {
        entityType: 'task',
        entityId: taskId,
        action: 'unassigned',
        changes: { assigneeId: { from: userId, to: null } },
      })

      await manager.delete(Assignee, { id: row.id, orgId: row.orgId })
    })

    return assigneeIds.filter((one) => one !== userId)
  }

  /**
   * Applies the filters, the ordering and the cursor, and shapes the page.
   *
   * **Every filter is ANDed; several values inside one is "is in".** That is
   * the whole grammar — an OR across different fields is a query builder, and
   * a query builder is Phase 4's saved views rather than something a person
   * can send a colleague as a link.
   *
   * 🔒 The resume is a keyset comparison on `(sort expression, id)`, never an
   * offset: `sort_order` is a fractional index, so a drag between two requests
   * changes how many rows sit before your position and `OFFSET` then repeats a
   * row or skips one, silently. See `shared/http/cursor.ts`.
   *
   * One extra row is fetched to answer `hasMore` without a second count over
   * the same filters.
   */
  private async paginate(
    builder: SelectQueryBuilder<Task>,
    query: ListTasksQuery,
    projectOf: (task: Task) => Pick<Project, 'keyPrefix'>,
  ): Promise<Page<TaskView>> {
    const sort = TASK_SORTS[query.sort]
    const direction = query.dir === 'desc' ? 'DESC' : 'ASC'

    builder.andWhere('task.deletedAt IS NULL')

    if (query.statusId) {
      builder.andWhere('task.statusId IN (:...statusIds)', {
        statusIds: query.statusId,
      })
    }
    if (query.priority) {
      builder.andWhere('task.priority IN (:...priorities)', {
        priorities: query.priority,
      })
    }
    if (query.assigneeId) {
      builder.andWhere(assignedTo('assigneeIds'), {
        assigneeIds: query.assigneeId,
      })
    }
    if (query.dueAfter) {
      builder.andWhere('task.dueDate >= :dueAfter', {
        dueAfter: query.dueAfter,
      })
    }
    if (query.dueBefore) {
      builder.andWhere('task.dueDate <= :dueBefore', {
        dueBefore: query.dueBefore,
      })
    }
    if (query.q) {
      // ILIKE rather than full-text: the box is a "find that card" filter over
      // a few hundred titles, not a search engine, and `tsvector` would need a
      // Thai dictionary Postgres does not ship.
      builder.andWhere('task.title ILIKE :needle', { needle: `%${query.q}%` })
    }

    if (query.cursor !== undefined) {
      const [value, id] = decodeCursor(query.cursor)

      // `CAST(… AS …)` rather than `::`, which TypeORM's parameter parser
      // reads as a placeholder named after the type.
      builder.andWhere(
        `(${sort.sql}, task.id) ${direction === 'ASC' ? '>' : '<'} ` +
          `(CAST(:cursorValue AS ${sort.cast}), CAST(:cursorId AS uuid))`,
        { cursorValue: value, cursorId: id },
      )
    }

    const { entities, raw } = await builder
      .addSelect(sort.sql, 'cursor_value')
      .orderBy(sort.sql, direction)
      .addOrderBy('task.id', direction)
      .limit(query.limit + 1)
      .getRawAndEntities<{ cursor_value: unknown }>()

    const assignees = await this.assigneesOf(entities.map((task) => task.id))

    return toPage(
      entities.map((task, index) => ({ task, raw: raw[index] })),
      query.limit,
      ({ task, raw: row }) => [cursorValue(row?.cursor_value), task.id],
      ({ task }) => view(task, projectOf(task), assignees.get(task.id) ?? []),
    )
  }

  /**
   * Queues the "you have been assigned" mail, in the caller's transaction.
   *
   * Everything the message says is put in the payload rather than looked up
   * when it is sent: `OutboxWorker` renders it long after this request, with
   * no organisation context. Storing a template name and a payload rather
   * than a rendered subject and body is what lets wording be corrected
   * afterwards — see `templates.ts`.
   *
   * The link is by task id, not by key. Keys are allowed to repeat across
   * projects (docs/04-features/phase-1.md#task-key), so `WEB-12` in a URL
   * could open the wrong piece of work.
   */
  private async announce(
    manager: EntityManager,
    task: Task,
    project: Project,
    recipientId: string,
    actorId: string,
  ): Promise<void> {
    const people = await this.users.findByIds([recipientId, actorId])
    const byId = new Map(people.map((person) => [person.id, person]))

    await this.email.enqueue(manager, {
      recipientId,
      template: 'task_assigned',
      payload: {
        taskKey: `${project.keyPrefix}-${task.number}`,
        title: task.title,
        projectName: project.name,
        recipientName: byId.get(recipientId)?.nickname ?? '',
        assignedByName: byId.get(actorId)?.nickname ?? '',
        url: `${this.appUrl}/tasks/${task.id}`,
      },
    })
  }

  /**
   * The task, its project, and the assignees — having checked the caller may
   * do `action` to it.
   *
   * The order matters and is the same one `ProjectService.requireProject`
   * uses: find the row, then whether the project is visible (404 either way,
   * so a refusal never confirms a task exists in a project the caller cannot
   * see), then whether they may do this to it (403, since by then they can see
   * it and deserve a plain answer).
   */
  private async requireTask(
    taskId: string,
    action: Action,
  ): Promise<TaskContext> {
    const task = await this.tasks.queryBuilder
      .withOrg('task')
      .andWhere('task.id = :taskId', { taskId })
      .andWhere('task.deletedAt IS NULL')
      .getOne()

    if (!task) throw notFound()

    const { project, role } = await this.projects
      .findVisible(task.projectId)
      // The project's 404 says "no such project", which is not the question
      // that was asked. Anything else — a 403, a database error — is not this
      // method's to reinterpret.
      .catch((error: unknown) => {
        throw error instanceof ApiException && error.getStatus() === 404
          ? notFound()
          : error
      })

    this.permissions.assert(
      actorForProject(role, task.projectId),
      action,
      'Task',
      { projectId: task.projectId },
    )

    if (action !== 'read') refuseIfArchived(project)

    const assignees = await this.assigneesOf([taskId])

    return { task, project, assigneeIds: assignees.get(taskId) ?? [] }
  }

  /** taskId → the user ids assigned to it, for a whole page of tasks at once. */
  private async assigneesOf(taskIds: string[]): Promise<Map<string, string[]>> {
    const byTask = new Map<string, string[]>()

    if (taskIds.length === 0) return byTask

    const rows = await this.assignees.queryBuilder
      .withOrg('assignee')
      .andWhere('assignee.taskId IN (:...taskIds)', { taskIds })
      .andWhere("assignee.assigneeType = 'user'")
      .orderBy('assignee.createdAt', 'ASC')
      .getMany()

    for (const row of rows) {
      byTask.set(row.taskId, [
        ...(byTask.get(row.taskId) ?? []),
        row.assigneeId,
      ])
    }

    return byTask
  }

  /**
   * Where the task ends up in the order.
   *
   * **Position is within a column, not within the project.** The order is one
   * key per task, but the neighbours that matter are the cards in the same
   * status, because that is the list a person is dragging inside. Computing
   * against the project-wide neighbours would put a card between two rows the
   * board never showed next to each other, and the drop would land somewhere
   * else than where it was released.
   *
   * Three cases, and the third is the one worth naming: a status change with
   * no `afterId` appends to the bottom of the new column. Keeping the old key
   * would drop the card into the middle of a column it has never been in,
   * which is what "moved it to Done" must not look like.
   */
  private async nextSortOrder(
    task: Task,
    nextStatusId: string | null,
    patch: UpdateTaskInput,
  ): Promise<string> {
    const columnId = nextStatusId ?? task.statusId

    if (patch.afterId === undefined) {
      if (nextStatusId === null) return task.sortOrder

      const last = await this.lastInColumn(task.projectId, columnId, task.id)

      return between(last?.sortOrder ?? null, null)
    }

    const column = (
      await this.tasks.queryBuilder
        .withOrg('task')
        .andWhere('task.projectId = :projectId', { projectId: task.projectId })
        .andWhere('task.statusId = :statusId', { statusId: columnId })
        .andWhere('task.deletedAt IS NULL')
        .orderBy('task.sortOrder', 'ASC')
        .getMany()
    ).filter((one) => one.id !== task.id)

    if (patch.afterId === null) {
      return between(null, column[0]?.sortOrder ?? null)
    }

    const at = column.findIndex((one) => one.id === patch.afterId)

    if (at === -1) throw ApiException.notFound('No such task to move after')

    return between(column[at]!.sortOrder, column[at + 1]?.sortOrder ?? null)
  }

  /** The bottom card of a column, ignoring one task that is on its way out of it. */
  private lastInColumn(
    projectId: string,
    statusId: string,
    excludingId: string | null,
  ): Promise<Task | null> {
    const builder = this.tasks.queryBuilder
      .withOrg('task')
      .andWhere('task.projectId = :projectId', { projectId })
      .andWhere('task.statusId = :statusId', { statusId })
      .andWhere('task.deletedAt IS NULL')
      .orderBy('task.sortOrder', 'DESC')

    if (excludingId !== null) {
      builder.andWhere('task.id != :excludingId', { excludingId })
    }

    return builder.getOne()
  }
}

/**
 * The completion pair for a task now sitting in a status that does or does not
 * count as finished.
 *
 * Both columns move together — `tasks_completed_pair_check` requires it — and
 * an already-completed task keeps the date it had, so re-entering a done
 * status from another done status is not a second completion.
 */
function completionFor(
  isDoneType: boolean,
  current: Pick<Task, 'completedAt' | 'completedBy'>,
  userId: string,
): Pick<Task, 'completedAt' | 'completedBy'> {
  if (!isDoneType) return { completedAt: null, completedBy: null }
  if (current.completedAt !== null) return current

  return { completedAt: new Date(), completedBy: userId }
}

/**
 * "Assigned to one of these people", as a subquery rather than a join.
 *
 * A join would multiply the task row once per assignee and turn `limit` into a
 * number of *assignments*, which is the classic way a paged list returns eight
 * rows when it promised fifty.
 */
function assignedTo(parameter: string): string {
  return `EXISTS (
    SELECT 1 FROM task.assignees a
     WHERE a.task_id = task.id
       AND a.org_id = task.org_id
       AND a.assignee_type = 'user'
       AND a.assignee_id IN (:...${parameter})
  )`
}

/** The ordering value as a cursor holds it — a string, whatever the column is. */
function cursorValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString()

  return String(value)
}

function emptyPage(): Page<TaskView> {
  return wholeList<TaskView>([])
}

function refuseIfArchived(project: Project): void {
  if (project.archivedAt === null) return

  throw new ApiException(
    409,
    TASK_ERROR_CODES.PROJECT_ARCHIVED,
    'This project is archived. Un-archive it before changing its work.',
  )
}

function notFound(): ApiException {
  return ApiException.notFound('Task not found')
}

function view(
  task: Task,
  project: Pick<Project, 'keyPrefix'>,
  assigneeIds: string[],
): TaskView {
  return {
    id: task.id,
    projectId: task.projectId,
    // Assembled, never stored: changing a project's prefix rekeys every task
    // in it with no backfill. docs/04-features/phase-1.md#task-key
    key: `${project.keyPrefix}-${task.number}`,
    number: task.number,
    title: task.title,
    description: task.description,
    statusId: task.statusId,
    priority: task.priority as TaskPriority | null,
    dueDate: task.dueDate,
    sortOrder: task.sortOrder,
    completedAt: task.completedAt,
    completedBy: task.completedBy,
    assigneeIds,
  }
}

/** A unique violation on `(task_id, assignee_type, assignee_id)`. */
function alreadyAssigned(error: unknown): unknown {
  const driver = error instanceof QueryFailedError ? error.driverError : null

  if ((driver as { code?: string } | null)?.code !== UNIQUE_VIOLATION) {
    return error
  }

  return new ApiException(
    409,
    TASK_ERROR_CODES.ALREADY_ASSIGNED,
    'That person already has this task',
  )
}
