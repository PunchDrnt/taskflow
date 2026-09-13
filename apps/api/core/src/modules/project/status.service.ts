import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm'

import {
  STATUS_ERROR_CODES,
  type CreateStatusInput,
  type StatusKind,
  type UpdateStatusInput,
} from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { requireOrgContext } from '#shared/org-scope/request-context'
import { between } from '#shared/sort-order'

import { AuditService } from '../audit/audit.service'
import { changesBetween } from '../audit/changes'
import { TasksInStatusService } from '../task/tasks-in-status.service'
import { ProjectService } from './project.service'
import { Status } from './status.entity'

/** A status as the board and the settings screen need it. */
export interface StatusView {
  id: string
  name: string
  color: string
  kind: StatusKind
  /** Where a new task lands. Exactly one per project. */
  isDefault: boolean
  sortOrder: string
}

/** A status as the settings screen needs it: the row, plus what is in it. */
export interface StatusWithTaskCount extends StatusView {
  taskCount: number
}

const UNIQUE_VIOLATION = '23505'

/**
 * The statuses of one project — the columns on its board.
 *
 * Five rules hold this table together, and none of them is a constraint the
 * database can express on its own, because each is about a *set* of rows
 * rather than one:
 *
 * - a project always has at least one status;
 * - at least one of them counts as finished (`is_done_type`), or nothing can
 *   ever be completed and every progress figure reads zero forever;
 * - a project that has somewhere to put abandoned work keeps it — see
 *   `lastOfItsKind`, and `docs/04-features/phase-1.md#status` for the decision;
 * - exactly one is the default, or a new task has nowhere to start;
 * - a status holding tasks cannot be removed out from under them.
 *
 * The first two are the 🔒 invariant `.claude/checklists/phase-1.md` §0 has
 * been carrying since Phase 0, waiting for a service to enforce them.
 *
 * The database holds one corner of the third: the partial unique index on
 * `(project_id) WHERE is_default AND deleted_at IS NULL` makes "two defaults"
 * unrepresentable, so a future path that would produce one errors instead of
 * quietly filing new work in a column nobody chose. See `moveDefault`.
 */
@Injectable()
export class StatusService {
  constructor(
    @InjectOrgRepository(Status)
    private readonly statuses: OrgScopedRepository<Status>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly projects: ProjectService,
    private readonly tasks: TasksInStatusService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Ordered as the board draws them. Seeing the project is the requirement.
   *
   * Each one carries how many live tasks are in it, because two of the rules
   * this table enforces are things a screen has to show *before* somebody acts
   * on them rather than after: a status holding work cannot be deleted, and
   * changing what one counts as rewrites the completion of everything in it.
   * A number beside the row is what makes a disabled button explain itself.
   */
  async list(projectId: string): Promise<StatusWithTaskCount[]> {
    await this.projects.findVisible(projectId)

    const [rows, counts] = await Promise.all([
      this.rows(projectId),
      this.tasks.countsByStatus(projectId),
    ])

    return rows.map((status) => ({
      ...view(status),
      taskCount: counts.get(status.id) ?? 0,
    }))
  }

  async create(
    projectId: string,
    input: CreateStatusInput,
  ): Promise<StatusView> {
    const { orgId, userId } = requireOrgContext()

    await this.projects.requireProject(projectId, 'update')

    const last = (await this.rows(projectId)).at(-1)

    return this.dataSource.transaction(async (manager) => {
      const row = {
        orgId,
        projectId,
        name: input.name,
        color: input.color,
        // A new status goes at the end of the board, never in the middle:
        // nobody asked for a position, and inventing one moves work that is
        // already sorted.
        sortOrder: between(last?.sortOrder ?? null, null),
        isDefault: false,
        ...flagsFor(input.kind),
        createdBy: userId,
        updatedBy: userId,
      }

      let created: Status

      try {
        const inserted = await manager.insert(Status, row)

        created = { ...(inserted.generatedMaps[0] as Status), ...row }
      } catch (error) {
        throw nameClash(error, input.name)
      }

      await this.audit.record(manager, {
        entityType: 'status',
        entityId: created.id,
        action: 'created',
        changes: {
          name: { from: null, to: input.name },
          color: { from: null, to: input.color },
          kind: { from: null, to: input.kind },
        },
      })

      return view(created)
    })
  }

  /**
   * Renames a status, recolours it, changes what it counts as, moves it, or
   * makes it the default.
   *
   * The interesting part is `kind`. Changing it has to reach the tasks already
   * sitting in this status — see `TasksInStatusService.reconcileCompletion`
   * for why that direction is the one that gets forgotten — and it cannot take
   * away the project's last finished or last cancelled column, which retyping
   * a row does just as thoroughly as deleting it.
   */
  async update(
    projectId: string,
    statusId: string,
    patch: UpdateStatusInput,
  ): Promise<StatusView> {
    const { userId } = requireOrgContext()

    await this.projects.requireProject(projectId, 'update')

    const all = await this.rows(projectId)
    const status = all.find((one) => one.id === statusId)

    if (!status) throw ApiException.notFound('Status not found')

    const nextKind = patch.kind ?? kindOf(status)
    const refusal = lastOfItsKind(all, status, nextKind)

    if (refusal !== null) throw refusal

    const sortOrder =
      patch.afterId === undefined
        ? status.sortOrder
        : this.keyAfter(all, statusId, patch.afterId)

    const after = {
      ...status,
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.color === undefined ? {} : { color: patch.color }),
      ...flagsFor(nextKind),
      sortOrder,
    }

    const changes = changesBetween({ ...status }, after)

    if (Object.keys(changes).length === 0 && patch.isDefault !== true) {
      return view(status)
    }

    await this.dataSource.transaction(async (manager) => {
      if (Object.keys(changes).length > 0) {
        try {
          await manager.update(Status, statusId, {
            name: after.name,
            color: after.color,
            isDoneType: after.isDoneType,
            isCancelledType: after.isCancelledType,
            sortOrder: after.sortOrder,
            updatedBy: userId,
          })
        } catch (error) {
          throw nameClash(error, patch.name)
        }
      }

      if (patch.isDefault === true && !status.isDefault) {
        await this.moveDefault(manager, projectId, statusId, userId)
        changes['isDefault'] = { from: false, to: true }
      }

      // 🔒 Both directions, and only when the meaning actually changed:
      // becoming finished stamps a completion on the tasks already here,
      // ceasing to be finished takes it back off them.
      if (status.isDoneType !== after.isDoneType) {
        const touched = await this.tasks.reconcileCompletion(
          manager,
          statusId,
          after.isDoneType,
        )

        if (touched > 0)
          changes['tasksReconciled'] = { from: null, to: touched }
      }

      await this.audit.record(manager, {
        entityType: 'status',
        entityId: statusId,
        action: 'updated',
        changes,
      })
    })

    return view({
      ...after,
      isDefault: patch.isDefault === true || after.isDefault,
    })
  }

  /**
   * Removes a status, if the project can spare it.
   *
   * Four refusals, in the order somebody hits them. Two of them are not in the
   * original specification, which named only "the last one" and "one still in
   * use": "it is the default" leaves a project where the next quick-add has
   * nowhere to file its task, and "it is the last of its kind" leaves one where
   * abandoned work has nowhere to go but Done (`lastOfItsKind`). Both refuse
   * rather than quietly promoting a neighbour, because which column work starts
   * in — or ends in — is the project's decision, and not one to make on their
   * behalf while they are deleting something else.
   */
  async remove(projectId: string, statusId: string): Promise<void> {
    await this.projects.requireProject(projectId, 'update')

    const all = await this.rows(projectId)
    const status = all.find((one) => one.id === statusId)

    if (!status) throw ApiException.notFound('Status not found')

    if (all.length === 1) {
      throw new ApiException(
        409,
        STATUS_ERROR_CODES.LAST_STATUS,
        'A project must keep at least one status',
      )
    }

    // Removing it is `nextKind: null` — the meaning goes away as completely as
    // it does when somebody retypes the row, which is why both paths ask the
    // same function rather than each carrying its own copy of the rule.
    const refusal = lastOfItsKind(all, status, null)

    if (refusal !== null) throw refusal

    if (status.isDefault) {
      throw new ApiException(
        409,
        STATUS_ERROR_CODES.LAST_DEFAULT_STATUS,
        'This is the default status for new tasks. Make another status the default first.',
      )
    }

    // Asked of the task module rather than counted here: `task.tasks` is not
    // this module's table. The settings screen greys the button out with the
    // same number, so the error is the backstop rather than the first the
    // person hears of it.
    const inUse = await this.tasks.countInStatus(statusId)

    if (inUse > 0) {
      throw new ApiException(
        409,
        STATUS_ERROR_CODES.STATUS_IN_USE,
        inUse === 1
          ? `There is still 1 task in this status. Move it out first.`
          : `There are still ${inUse} tasks in this status. Move them out first.`,
        { tasks: inUse },
      )
    }

    await this.dataSource.transaction(async (manager) => {
      await this.audit.record(manager, {
        entityType: 'status',
        entityId: statusId,
        action: 'deleted',
        changes: { name: { from: status.name, to: null } },
      })

      // Soft delete: the status is a `BaseEntity`, and the partial unique
      // indexes on this table are all `WHERE deleted_at IS NULL`, so the name
      // is released while any task that ever pointed here still resolves.
      await manager.update(Status, statusId, {
        deletedAt: new Date(),
        deletedBy: requireOrgContext().userId,
        updatedBy: requireOrgContext().userId,
      })
    })
  }

  /**
   * The status a new task starts in.
   *
   * 🔒 Exactly one row can satisfy this — the partial unique index on
   * `(project_id) WHERE is_default AND deleted_at IS NULL` — and `remove`
   * refuses to leave a project without it, so the absent case is a project
   * whose statuses were tampered with outside these methods. Loud rather than
   * silently filing the task in whatever sorts first.
   *
   * ⚠️ Takes an id, not a permission: the caller has already established that
   * this person may work in the project. Same for `requireStatusOfProject`.
   */
  async defaultStatus(projectId: string): Promise<Status> {
    const status = await this.statuses.queryBuilder
      .withOrg('status')
      .andWhere('status.projectId = :projectId', { projectId })
      .andWhere('status.deletedAt IS NULL')
      .andWhere('status.isDefault')
      .getOne()

    if (!status) {
      throw new Error(
        `Project ${projectId} has no default status. Every project is created ` +
          'with one (DEFAULT_STATUSES) and StatusService.remove refuses to ' +
          'delete the last one, so this means the table was edited elsewhere.',
      )
    }

    return status
  }

  /**
   * One status of this project, or 404.
   *
   * Scoped by `project_id` and not by id alone, so naming a status that exists
   * in a *different* project of the same organisation is rejected rather than
   * accepted — `tasks_status_fkey` is composite on `(status_id, org_id)` and
   * would let it through, since both rows are in the same org. A task in one
   * project pointing at another project's column would show up as a card in a
   * board it does not belong to.
   */
  async requireStatusOfProject(
    projectId: string,
    statusId: string,
  ): Promise<Status> {
    const status = await this.statuses.queryBuilder
      .withOrg('status')
      .andWhere('status.projectId = :projectId', { projectId })
      .andWhere('status.id = :statusId', { statusId })
      .andWhere('status.deletedAt IS NULL')
      .getOne()

    if (!status) throw ApiException.notFound('Status not found')

    return status
  }

  /**
   * The statuses that mean a piece of work is no longer open — finished or
   * abandoned — for one project or for the whole organisation.
   *
   * My Tasks hides these by default, and it asks here rather than joining
   * `project.statuses` itself: that table belongs to this module. An
   * organisation this size has a few dozen statuses, so the list is short
   * enough to hand over as ids.
   *
   * ⚠️ Takes an id, not a permission — the caller has already settled what
   * they may see.
   */
  closedStatusIds(projectId?: string): Promise<string[]> {
    const builder = this.statuses.queryBuilder
      .withOrg('status')
      .select('status.id', 'id')
      .andWhere('status.deletedAt IS NULL')
      .andWhere('(status.isDoneType OR status.isCancelledType)')

    if (projectId !== undefined) {
      builder.andWhere('status.projectId = :projectId', { projectId })
    }

    return builder
      .getRawMany<{ id: string }>()
      .then((rows) => rows.map((row) => row.id))
  }

  /**
   * The same question as `closedStatusIds`, asked of projects in more than one
   * organisation — what `GET /v1/me/tasks` hides unless asked not to.
   *
   * ⚠️ `base`, not `withOrg`: there is no single org to scope by on that
   * route. Scoping is by `project_id` instead, which is *tighter* than an org
   * condition rather than looser — the ids come from
   * `ProjectService.listAcrossOrgs`, so a status can only be reached through a
   * project the caller was already allowed to see.
   */
  async closedStatusIdsForProjects(projectIds: string[]): Promise<string[]> {
    if (projectIds.length === 0) return []

    const rows = await this.statuses.queryBuilder
      .base('status')
      .select('status.id', 'id')
      .where('status.projectId IN (:...projectIds)', { projectIds })
      .andWhere('status.deletedAt IS NULL')
      .andWhere('(status.isDoneType OR status.isCancelledType)')
      .getRawMany<{ id: string }>()

    return rows.map((row) => row.id)
  }

  /** Live statuses of one project, in board order. */
  private rows(projectId: string): Promise<Status[]> {
    return this.statuses.queryBuilder
      .withOrg('status')
      .andWhere('status.projectId = :projectId', { projectId })
      .andWhere('status.deletedAt IS NULL')
      .orderBy('status.sortOrder', 'ASC')
      .getMany()
  }

  /**
   * Clears the old default and sets the new one, in the caller's transaction.
   *
   * Two requests moving the default at once serialise on the old default's
   * row: the second blocks on the first's `UPDATE`, and when it resumes it
   * re-reads and clears whatever the first made default before setting its
   * own. Either order leaves exactly one.
   *
   * The partial unique index `(project_id) WHERE is_default AND deleted_at IS
   * NULL` is the backstop rather than the mechanism — it is what turns any
   * future path that *would* leave two defaults into an error instead of a
   * project where new tasks land in a column nobody chose.
   */
  private async moveDefault(
    manager: EntityManager,
    projectId: string,
    statusId: string,
    userId: string,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(Status)
      .set({ isDefault: false, updatedBy: userId })
      .where('project_id = :projectId', { projectId })
      .andWhere('org_id = :orgId', { orgId: this.statuses.orgId })
      .andWhere('is_default')
      .andWhere('deleted_at IS NULL')
      .execute()

    await manager.update(Status, statusId, {
      isDefault: true,
      updatedBy: userId,
    })
  }

  /**
   * The sort key that puts `statusId` directly after `afterId`, or first when
   * that is null.
   *
   * Computed from the neighbours as they are now rather than taken from the
   * client — see `updateStatusSchema`. The status being moved is dropped from
   * the list first, so moving it next to itself is not asked of `between`,
   * which would refuse the pair as equal.
   */
  private keyAfter(
    all: Status[],
    statusId: string,
    afterId: string | null,
  ): string {
    const others = all.filter((one) => one.id !== statusId)

    if (afterId === null) return between(null, others[0]?.sortOrder ?? null)

    const at = others.findIndex((one) => one.id === afterId)

    if (at === -1) throw ApiException.notFound('No such status to move after')

    return between(others[at]!.sortOrder, others[at + 1]?.sortOrder ?? null)
  }
}

/**
 * The kinds a project may not run out of, and what to say when it would.
 *
 * `normal` is deliberately absent: a board of nothing but finished and
 * abandoned columns is strange, but it is not *wrong* the way the other two
 * are — nothing silently computes a false number from it.
 */
const KIND_FLOORS = [
  {
    kind: 'done',
    code: STATUS_ERROR_CODES.LAST_DONE_STATUS,
    message:
      'A project must keep at least one status that counts as done. ' +
      'Mark another status as done first.',
  },
  {
    kind: 'cancelled',
    code: STATUS_ERROR_CODES.LAST_CANCELLED_STATUS,
    message:
      'A project must keep at least one status that counts as cancelled. ' +
      'Mark another status as cancelled first.',
  },
] as const satisfies { kind: StatusKind; code: string; message: string }[]

/**
 * Why this project cannot let `status` stop being what it is, or null.
 *
 * `nextKind` is what the row will count as afterwards — `null` when it is
 * being removed, which is the same loss by another route.
 *
 * The cancelled floor is **not in the original specification**, which asked
 * only for one `is_done_type`; `.claude/docs/04-features/phase-1.md#status`
 * records it. Cancelled work leaves the denominator of a progress bar and done
 * work stays in it, so a project with nowhere to put abandoned work gets it
 * filed under Done instead and every figure computed from that point on is
 * wrong — a seeded Cancelled column that anybody can delete is that bug with
 * an extra step.
 *
 * Written as "keep one" rather than "have one", so it can only ever hold a
 * kind that is already there. In practice that is a distinction without a
 * difference, because `DEFAULT_STATUSES` gives every project both kinds on the
 * day it is created — so both floors are ratchets from the first row, which is
 * the same deal the done floor has always been.
 */
function lastOfItsKind(
  all: Status[],
  status: Status,
  nextKind: StatusKind | null,
): ApiException | null {
  for (const floor of KIND_FLOORS) {
    const losing = kindOf(status) === floor.kind && nextKind !== floor.kind
    const others = all.filter(
      (one) => one.id !== status.id && kindOf(one) === floor.kind,
    )

    if (losing && others.length === 0) {
      return new ApiException(409, floor.code, floor.message)
    }
  }

  return null
}

function kindOf(status: Status): StatusKind {
  if (status.isDoneType) return 'done'
  if (status.isCancelledType) return 'cancelled'

  return 'normal'
}

/** The one API choice, spread into the two columns and their CHECK. */
function flagsFor(kind: StatusKind): {
  isDoneType: boolean
  isCancelledType: boolean
} {
  return {
    isDoneType: kind === 'done',
    isCancelledType: kind === 'cancelled',
  }
}

function view(status: Status): StatusView {
  return {
    id: status.id,
    name: status.name,
    color: status.color,
    kind: kindOf(status),
    isDefault: status.isDefault,
    sortOrder: status.sortOrder,
  }
}

/** A unique violation on `(project_id, name)`, which is a duplicate name. */
function nameClash(error: unknown, name: string | undefined): unknown {
  const driver = error instanceof QueryFailedError ? error.driverError : null

  if ((driver as { code?: string } | null)?.code !== UNIQUE_VIOLATION) {
    return error
  }

  return new ApiException(
    409,
    STATUS_ERROR_CODES.NAME_TAKEN,
    `A status named "${name ?? ''}" already exists in this project`,
  )
}
