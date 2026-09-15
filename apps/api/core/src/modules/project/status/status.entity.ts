import { Column, Entity } from 'typeorm'

import { BaseEntity } from '#shared/entity/base.entity'

/**
 * A column on the board. Every project defines its own set.
 */
@Entity({ schema: 'project', name: 'statuses' })
export class Status extends BaseEntity {
  @Column('uuid')
  projectId!: string

  @Column('text')
  name!: string

  /** A palette token, never a hex value, so themes can restyle without a migration. */
  @Column('text')
  color!: string

  /** Fractional index. COLLATE "C" so ordering is byte-wise on every machine. */
  @Column({ type: 'text', collation: 'C' })
  sortOrder!: string

  /** The status a new task starts in. At most one per project. */
  @Column('boolean', { default: false })
  isDefault!: boolean

  /** Counts as finished. A project needs at least one. */
  @Column('boolean', { default: false })
  isDoneType!: boolean

  /** Cancelled work leaves the denominator of a progress bar; done work stays in it. */
  @Column('boolean', { default: false })
  isCancelledType!: boolean
}
