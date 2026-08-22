import { Column, Entity } from 'typeorm'

import { SoftDeletableEntity } from '#shared/entity/base.entity'

/**
 * A price tier. The documented second exception to the org_id rule: a
 * system-wide catalogue, not something an org owns.
 *
 * Created in Phase 0 and untouched by code until Phase 7.
 */
@Entity({ schema: 'billing', name: 'plans' })
export class Plan extends SoftDeletableEntity {
  @Column('text')
  name!: string

  @Column('integer', { nullable: true })
  maxUsers!: number | null

  /** numeric, never float — money does not round the way binary floats do. */
  @Column({ type: 'numeric', default: 0 })
  priceMonthly!: string

  @Column({ type: 'numeric', default: 0 })
  priceYearly!: string

  @Column({ type: 'numeric', default: 1 })
  aiMultiplier!: string

  @Column('integer', { nullable: true })
  aiDailyLimit!: number | null

  @Column('jsonb', { default: {} })
  featuresJson!: Record<string, unknown>
}
