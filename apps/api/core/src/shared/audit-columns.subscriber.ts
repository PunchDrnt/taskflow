import {
  EventSubscriber,
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
 * Registered through `subscribers` in the DataSource options rather than as a
 * Nest provider. A provider only exists once Nest has built it, which left the
 * TypeORM CLI and every test writing rows with no `created_by` — a NOT NULL
 * violation, and one that only showed up at runtime.
 *
 * `createdAt` / `updatedAt` / `deletedAt` are TypeORM's own job via
 * @CreateDateColumn and friends; only the "by" half needs us.
 *
 * Deliberately does not invent a value when there is no context. A write from
 * a migration or a background job has to say who it is acting as — the system
 * user exists for that — rather than have one guessed here.
 */
@EventSubscriber()
export class AuditColumnsSubscriber implements EntitySubscriberInterface {
  private has(
    metadata: { columns: { propertyName: string }[] },
    name: string,
  ): boolean {
    return metadata.columns.some((column) => column.propertyName === name)
  }

  beforeInsert(event: InsertEvent<Record<string, unknown>>): void {
    const context = getRequestContext()
    if (!context || !event.entity) return

    // Only touch columns the entity actually has: audit.logs has neither.
    if (this.has(event.metadata, 'createdBy') && !event.entity.createdBy) {
      event.entity.createdBy = context.userId
    }
    if (this.has(event.metadata, 'updatedBy') && !event.entity.updatedBy) {
      event.entity.updatedBy = context.userId
    }
  }

  beforeUpdate(event: UpdateEvent<Record<string, unknown>>): void {
    const context = getRequestContext()
    if (!context || !event.entity) return

    if (this.has(event.metadata, 'updatedBy')) {
      event.entity.updatedBy = context.userId
    }
  }

  beforeSoftRemove(event: SoftRemoveEvent<Record<string, unknown>>): void {
    const context = getRequestContext()
    if (!context || !event.entity) return

    if (this.has(event.metadata, 'deletedBy')) {
      event.entity.deletedBy = context.userId
    }
    if (this.has(event.metadata, 'updatedBy')) {
      event.entity.updatedBy = context.userId
    }
  }
}
