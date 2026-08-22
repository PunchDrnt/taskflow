import { Column, Entity } from 'typeorm'

import { BaseEntity } from '#shared/entity/base.entity'

@Entity({ schema: 'billing', name: 'subscriptions' })
export class Subscription extends BaseEntity {
  @Column('uuid')
  planId!: string

  @Column('text')
  status!: string

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd!: Date | null

  @Column('integer', { default: 0 })
  seatsUsed!: number
}
