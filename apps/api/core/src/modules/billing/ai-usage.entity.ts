import { Column, Entity } from 'typeorm'

import { BaseEntity } from '../../shared/base.entity'

@Entity({ schema: 'billing', name: 'ai_usage' })
export class AiUsage extends BaseEntity {
  @Column('uuid')
  userId!: string

  /** Plain dates: usage is bucketed by calendar day and week. */
  @Column('date')
  periodDay!: string

  @Column('date')
  periodWeek!: string

  @Column('bigint', { default: 0 })
  tokensIn!: string

  @Column('bigint', { default: 0 })
  tokensOut!: string

  @Column('text')
  feature!: string
}
