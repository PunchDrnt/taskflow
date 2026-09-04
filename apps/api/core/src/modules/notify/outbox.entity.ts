import { Column, Entity } from 'typeorm'

import { TimestampedEntity } from '#shared/entity/base.entity'

/**
 * A notification waiting to go out — written inside the business transaction,
 * delivered by a worker afterwards, so a failed send rolls nothing back. No
 * soft delete: `status` tracks its life and retention removes sent rows.
 */
@Entity({ schema: 'notify', name: 'outbox' })
export class Outbox extends TimestampedEntity {
  /**
   * Null for a message that belongs to the *account* rather than to an
   * organisation — today the password-reset mail, whose recipient may be in
   * several orgs or in none.
   *
   * This is why the class extends `TimestampedEntity` and declares the column
   * itself rather than taking `OrgScopedEntity`'s: that base makes `orgId` a
   * `string`, and a subclass cannot widen it. The reason the column is
   * nullable at all is in the migration, beside it.
   *
   * It costs nothing at the read side — OutboxWorker crosses orgs on purpose
   * and never filters on this.
   */
  @Column('uuid', { nullable: true })
  orgId!: string | null

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
