import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm'

/**
 * The activity log — a feature name; the table is `audit.logs` and the module
 * is `audit/`.
 *
 * The one entity that uses no base class at all. The table is partitioned by
 * month, and Postgres requires the partition key in every unique constraint,
 * so the primary key is `(id, occurredAt)` — a generated id plus a second
 * @PrimaryColumn, rather than one @PrimaryGeneratedColumn on its own.
 *
 * `occurredAt` and `actorId` already record when and by whom, which is what
 * `createdAt`/`createdBy` would have said, and rows are never updated or
 * deleted, which leaves the rest of the base entity meaningless.
 *
 * No foreign keys, `actorId` included: the log has to outlive the rows it
 * describes.
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
