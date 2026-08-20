import { Column, Entity } from 'typeorm'

import { OrgScopedEntity } from '../../shared/base.entity'

/**
 * A notification waiting to go out. Written inside the business transaction
 * and delivered by a worker afterwards, so a failed send never rolls back the
 * thing it was announcing.
 *
 * Extends OrgScopedEntity: no soft delete, because `status` already tracks its
 * life and retention hard-deletes sent rows after 30 days.
 */
@Entity({ schema: 'notify', name: 'outbox' })
export class Outbox extends OrgScopedEntity {
  @Column('uuid')
  recipientId!: string

  /** 'email' | 'discord' | 'line' */
  @Column('text')
  channel!: string

  /** 'task_assigned' | 'due_soon' | … — grows per feature, so no CHECK. */
  @Column('text')
  template!: string

  @Column('jsonb', { default: {} })
  payloadJson!: Record<string, unknown>

  /** 'pending' | 'sent' | 'failed'. The worker's queue reads this literally. */
  @Column('text', { default: 'pending' })
  status!: string

  @Column('integer', { default: 0 })
  attempts!: number

  @Column({ type: 'timestamptz', nullable: true })
  sentAt!: Date | null

  @Column('text', { nullable: true })
  lastError!: string | null
}
