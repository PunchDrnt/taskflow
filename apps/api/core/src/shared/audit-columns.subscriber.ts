import { Injectable } from '@nestjs/common'
import {
  DataSource,
  type EntitySubscriberInterface,
  type InsertEvent,
  type SoftRemoveEvent,
  type UpdateEvent,
} from 'typeorm'

import { getRequestContext } from './request-context'

/**
 * Fills `createdBy` / `updatedBy` / `deletedBy` from the request context, so
 * no service has to remember to.
 *
 * `createdAt` / `updatedAt` / `deletedAt` are TypeORM's own job via
 * @CreateDateColumn and friends; only the "by" half needs us. That split is
 * exactly why `deletedBy` is easy to lose: a bare `softRemove()` sets
 * `deletedAt` and nothing else, which every soft-deletable table now rejects
 * with a CHECK. This subscriber is what keeps that from happening.
 *
 * Deliberately does not invent a value when there is no context. A write from
 * a migration or a background job has to say who it is acting as — the system
 * user exists for that — rather than have one guessed here.
 */
@Injectable()
export class AuditColumnsSubscriber implements EntitySubscriberInterface {
  constructor(dataSource: DataSource) {
    dataSource.subscribers.push(this)
  }

  beforeInsert(event: InsertEvent<Record<string, unknown>>): void {
    const context = getRequestContext()
    if (!context || !event.entity) return

    const columns = new Set(
      event.metadata.columns.map((column) => column.propertyName),
    )

    // Only touch columns the entity actually has: audit.logs has neither.
    if (columns.has('createdBy') && event.entity.createdBy === undefined) {
      event.entity.createdBy = context.userId
    }
    if (columns.has('updatedBy') && event.entity.updatedBy === undefined) {
      event.entity.updatedBy = context.userId
    }
  }

  beforeUpdate(event: UpdateEvent<Record<string, unknown>>): void {
    const context = getRequestContext()
    if (!context || !event.entity) return

    const columns = new Set(
      event.metadata.columns.map((column) => column.propertyName),
    )
    if (columns.has('updatedBy')) {
      event.entity.updatedBy = context.userId
    }
  }

  beforeSoftRemove(event: SoftRemoveEvent<Record<string, unknown>>): void {
    const context = getRequestContext()
    if (!context || !event.entity) return

    const columns = new Set(
      event.metadata.columns.map((column) => column.propertyName),
    )
    if (columns.has('deletedBy')) {
      event.entity.deletedBy = context.userId
    }
    if (columns.has('updatedBy')) {
      event.entity.updatedBy = context.userId
    }
  }
}
