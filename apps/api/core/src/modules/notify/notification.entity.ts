import { Column, Entity } from 'typeorm'

import { OrgScopedEntity } from '#shared/entity/base.entity'

/**
 * The in-app inbox (Phase 3). Separate from `Outbox` because they answer
 * different questions — this one is "have they read it", read by the person it
 * belongs to; the outbox is "has it been sent", read by a worker and deleted
 * once it has.
 */
@Entity({ schema: 'notify', name: 'notifications' })
export class Notification extends OrgScopedEntity {
  @Column('uuid')
  recipientId!: string

  /** 'assigned' | 'mentioned' | 'comment' | 'status_changed' | 'due_soon' | 'stale' */
  @Column('text')
  type!: string

  /** NULL means the system did it — the due-date cron has no actor to name. */
  @Column({ type: 'uuid', nullable: true })
  actorId!: string | null

  /** Polymorphic, no FK — the shape `audit.logs` uses. */
  @Column('text')
  entityType!: string

  @Column('uuid')
  entityId!: string

  /** Enough to render the line without joining anything. */
  @Column('jsonb', { default: {} })
  payloadJson!: Record<string, unknown>

  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null
}
