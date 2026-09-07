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
import { TaskService } from '../task/task.service'
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

const UNIQUE_VIOLATION = '23505'

/**
 * The statuses of one project — the columns on its board.
 *
 * Four rules hold this table together, and none of them is a constraint the
 * database can express on its own, because each is about a *set* of rows
 * rather than one:
 *
 * - a project always has at least one status;
 * - at least one of them counts as finished (`is_done_type`), or nothing can
 *   ever be completed and every progress figure reads zero forever;
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
    private readonly tasks: TaskService,
    private readonly audit: AuditService,
  ) {}

  /** Ordered as the board draws them. Seeing the project is the requirement. */
  async list(projectId: string): Promise<StatusView[]> {
    await this.projects.findVisible(projectId)

    return (await this.rows(projectId)).map(view)
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
   * sitting in this status — see `TaskService.reconcileCompletion` for why
   * that direction is the one that gets forgotten — and it cannot take away
   * the project's last finished status.
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

    if (!status) throw ApiException.notFound('ไม่พบสถานะนี้')

    const nextKind = patch.kind ?? kindOf(status)

    if (
      status.isDoneType &&
      nextKind !== 'done' &&
      countDone(all, statusId) === 0
    ) {
      throw new ApiException(
        409,
        STATUS_ERROR_CODES.LAST_DONE_STATUS,
        'โปรเจกต์ต้องมีสถานะที่นับว่าเสร็จอย่างน้อยหนึ่งอัน ' +
          'กรุณาตั้งสถานะอื่นเป็น "เสร็จ" ก่อน',
      )
    }

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
   * Three refusals, in the order somebody hits them. The third —
   * "it is the default" — is not in the original specification, which named
   * only "the last one" and "one still in use"; the gap it leaves is a project
   * with no default, where the next quick-add has nowhere to file the task.
   * Refusing rather than silently promoting a neighbour, because which column
   * work starts in is the project's decision and not one to make on their
   * behalf while they are deleting something else.
   */
  async remove(projectId: string, statusId: string): Promise<void> {
    await this.projects.requireProject(projectId, 'update')

    const all = await this.rows(projectId)
    const status = all.find((one) => one.id === statusId)

    if (!status) throw ApiException.notFound('ไม่พบสถานะนี้')

    if (all.length === 1) {
      throw new ApiException(
        409,
        STATUS_ERROR_CODES.LAST_STATUS,
        'โปรเจกต์ต้องมีสถานะอย่างน้อยหนึ่งอัน',
      )
    }

    if (status.isDoneType && countDone(all, statusId) === 0) {
      throw new ApiException(
        409,
        STATUS_ERROR_CODES.LAST_DONE_STATUS,
        'โปรเจกต์ต้องมีสถานะที่นับว่าเสร็จอย่างน้อยหนึ่งอัน ' +
          'กรุณาตั้งสถานะอื่นเป็น "เสร็จ" ก่อน',
      )
    }

    if (status.isDefault) {
      throw new ApiException(
        409,
        STATUS_ERROR_CODES.LAST_DEFAULT_STATUS,
        'สถานะนี้เป็นสถานะตั้งต้นของงานใหม่ กรุณาตั้งสถานะอื่นเป็นตั้งต้นก่อน',
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
        `ยังมีงาน ${inUse} ใบอยู่ในสถานะนี้ กรุณาย้ายงานออกก่อน`,
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

    if (at === -1) throw ApiException.notFound('ไม่พบสถานะที่จะย้ายไปต่อจาก')

    return between(others[at]!.sortOrder, others[at + 1]?.sortOrder ?? null)
  }
}

/** How many *other* live statuses count as finished. */
function countDone(all: Status[], excludingId: string): number {
  return all.filter((one) => one.isDoneType && one.id !== excludingId).length
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
    `มีสถานะชื่อ "${name ?? ''}" อยู่แล้วในโปรเจกต์นี้`,
  )
}
