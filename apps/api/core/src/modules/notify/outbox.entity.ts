import { Column, Entity } from 'typeorm'

import { OrgScopedEntity } from '../../shared/base.entity'

/**
 * A notification waiting to go out — written inside the business transaction,
 * delivered by a worker afterwards, so a failed send rolls nothing back. No
 * soft delete: `status` tracks its life and retention removes sent rows.
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
