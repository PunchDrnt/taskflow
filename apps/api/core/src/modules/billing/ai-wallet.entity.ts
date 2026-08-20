import { Column, Entity } from 'typeorm'

import { BaseEntity } from '../../shared/base.entity'

/**
 * AI credit granted to an org. A CHECK keeps `unitsUsed` within
 * `unitsGranted` — spending past the grant is a bug, not a state to record.
 */
@Entity({ schema: 'billing', name: 'ai_wallet' })
export class AiWallet extends BaseEntity {
  @Column('text')
  source!: string

  @Column({ type: 'numeric', default: 0 })
  unitsGranted!: string

  @Column({ type: 'numeric', default: 0 })
  unitsUsed!: string

  @Column('text', { nullable: true })
  periodKey!: string | null

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null
}
