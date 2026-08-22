import {
  EventSubscriber,
  type EntitySubscriberInterface,
  type InsertEvent,
  type SoftRemoveEvent,
  type UpdateEvent,
} from 'typeorm'

import { getRequestContext } from '../org-scope/request-context'

/**
 * Fills the `*By` half of the audit columns from the request context; the
 * `*At` half is TypeORM's own job.
 *
 * Registered through the DataSource's `subscribers`, not as a Nest provider —
 * a provider does not exist under the CLI or in tests, which left both writing
 * rows with no `created_by`.
 *
 * Invents nothing when there is no context: a job has to name its actor.
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
