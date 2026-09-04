import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { requireOrgContext } from '#shared/org-scope/request-context'

import type { Changes } from './changes'
import { AuditLog } from './log.entity'

/** The three every module writes. Others are added per feature, hence no CHECK. */
export const AUDIT_ACTIONS = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
} as const

export interface AuditEntry {
  /** 'task' | 'project' | … — the kind of thing that changed. */
  entityType: string
  entityId: string
  /** 'created' | 'updated' | … */
  action: string
  changes?: Changes
}

/**
 * The activity log. A feature name — the table is `audit.logs`.
 *
 * The only way in and the only way out: no other module may join `audit.logs`,
 * or nobody will ever be able to change its shape again. Reads are named in
 * audit's own vocabulary for the same reason — `getRecentActorTargets`, not
 * `getRecentAssignees`, so this module never learns what an assignee is.
 *
 * See docs/01-architecture.md#reading-the-audit-log-from-other-modules
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectOrgRepository(AuditLog)
    private readonly logs: OrgScopedRepository<AuditLog>,
  ) {}

  /**
   * 🔒 Writes the row in the caller's transaction, which is why the manager is
   * a parameter rather than something this service opens for itself.
   *
   * The alternative — emitting an event and letting a listener write — puts
   * the log outside the transaction: the business write commits, the listener
   * throws or the process dies, and the entry is gone with no error anywhere.
   * History cannot be reconstructed, so it gets the stronger guarantee, not
   * the weaker one. See docs/01-architecture.md#how-the-activity-log-is-written
   *
   * Refuses a manager that is not in a transaction rather than writing
   * something that only looks atomic.
   */
  async record(manager: EntityManager, entry: AuditEntry): Promise<void> {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error(
        'AuditService.record needs the EntityManager of an open transaction — ' +
          'the audit row has to commit or roll back with the change it ' +
          'describes. Call it from inside dataSource.transaction(...).',
      )
    }

    // org and actor come from the context rather than the caller, for the same
    // reason every other write does: an argument can be passed wrongly.
    const { orgId, userId } = requireOrgContext()

    await manager.insert(AuditLog, {
      orgId,
      actorId: userId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      changesJson: entry.changes ?? {},
    })
  }

  /** Everything that happened to one thing, newest first. */
  findForEntity(
    entityType: string,
    entityId: string,
    limit = 50,
  ): Promise<AuditLog[]> {
    return this.logs.queryBuilder
      .withOrg('log')
      .andWhere('log.entityType = :entityType', { entityType })
      .andWhere('log.entityId = :entityId', { entityId })
      .orderBy('log.occurredAt', 'DESC')
      .limit(limit)
      .getMany()
  }

  /**
   * The things an actor most recently performed some action on, newest first.
   *
   * Deliberately not `getRecentAssignees`: the caller in Phase 1 is an
   * assignee picker, but this module does not know what an assignee is, and
   * the next caller wants something else from the same query.
   */
  async findRecentTargets(
    actorId: string,
    action: string,
    limit = 10,
  ): Promise<string[]> {
    const rows = await this.logs.queryBuilder
      .withOrg('log')
      .select('log.entityId', 'entityId')
      .addSelect('max(log.occurredAt)', 'lastAt')
      .andWhere('log.actorId = :actorId', { actorId })
      .andWhere('log.action = :action', { action })
      .groupBy('log.entityId')
      .orderBy('"lastAt"', 'DESC')
      .limit(limit)
      .getRawMany<{ entityId: string }>()

    return rows.map((row) => row.entityId)
  }
}
