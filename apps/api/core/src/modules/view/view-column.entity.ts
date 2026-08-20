import { Column, Entity } from 'typeorm'

import { BaseEntity } from '../../shared/base.entity'

@Entity({ schema: 'view', name: 'columns' })
export class ViewColumn extends BaseEntity {
  @Column('uuid')
  viewId!: string

  /** 'builtin' | 'custom_field' — decides how to read columnKey. */
  @Column('text')
  columnType!: string

  /** 'status' | 'assignee' | a field.definitions UUID. Open by design. */
  @Column('text')
  columnKey!: string

  @Column({ type: 'text', collation: 'C' })
  sortOrder!: string

  @Column('integer', { nullable: true })
  width!: number | null

  @Column('boolean', { default: true })
  isVisible!: boolean
}
