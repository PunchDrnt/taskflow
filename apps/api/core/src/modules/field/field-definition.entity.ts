import { Column, Entity } from 'typeorm'

import { BaseEntity } from '../../shared/base.entity'

/**
 * A custom field on a project (Phase 4). Values live in
 * `task.tasks.customFields` as jsonb keyed by this row's id — there is no
 * per-value table, and no foreign key from that jsonb back here.
 */
@Entity({ schema: 'field', name: 'definitions' })
export class FieldDefinition extends BaseEntity {
  @Column('uuid')
  projectId!: string

  @Column('text')
  name!: string

  /** 'text' | 'date' | 'number' | 'select' */
  @Column('text')
  type!: string

  /** Options for a select, bounds for a number, and so on. */
  @Column('jsonb', { default: {} })
  configJson!: Record<string, unknown>

  @Column({ type: 'text', collation: 'C' })
  sortOrder!: string
}
