import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm'

/**
 * The activity log. The one entity on no base class: the table is partitioned
 * by month, and Postgres wants the partition key in every unique constraint,
 * so the pk is `(id, occurredAt)`. `occurredAt`/`actorId` already say what
 * `createdAt`/`createdBy` would, and rows are never updated or deleted.
 *
 * No foreign keys, `actorId` included — the log outlives what it describes.
 */
@Entity({ schema: 'audit', name: 'logs' })
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  /** Part of the primary key because it is the partition key. */
  @PrimaryColumn({ type: 'timestamptz', default: () => 'now()' })
  occurredAt!: Date

  @Column('uuid')
  orgId!: string

  /** 'task' | 'project' | … — grows with every feature, so no CHECK. */
  @Column('text')
  entityType!: string

  @Column('uuid')
  entityId!: string

  @Column('uuid')
  actorId!: string

  /** 'created' | 'updated' | 'deleted' | … */
  @Column('text')
  action!: string

  /** `{ field: { from, to } }` */
  @Column('jsonb', { default: {} })
  changesJson!: Record<string, unknown>
}
