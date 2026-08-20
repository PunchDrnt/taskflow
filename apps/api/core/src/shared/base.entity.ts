import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

/**
 * The columns every table carries, in the four shapes the schema actually uses.
 *
 * Most tables want `BaseEntity`. The other three exist because three groups of
 * tables genuinely differ, each for a reason recorded in
 * .claude/docs/02-database.md#base-entity--on-every-table-with-three-named-exceptions:
 *
 * | Class                      | org_id | soft delete | Used by                          |
 * | -------------------------- | ------ | ----------- | -------------------------------- |
 * | `BaseEntity`               | yes    | yes         | almost everything                |
 * | `SoftDeletableEntity`      | no     | yes         | identity.*, organizations, plans |
 * | `OrgScopedEntity`          | yes    | no          | notify.outbox                    |
 * | `TimestampedEntity`        | no     | no          | sessions, password_reset_tokens  |
 *
 * `audit.logs` uses none of them: its primary key is composite because the
 * table is partitioned, and `occurred_at`/`actor_id` already say when and by
 * whom, so it declares its columns itself.
 *
 * Dates are `timestamptz` explicitly. TypeORM defaults to `timestamp` without
 * a time zone, which would silently reinterpret every value.
 */
export abstract class TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  /** Filled by AuditColumnsSubscriber from the request context. */
  @Column('uuid')
  createdBy!: string

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date

  @Column('uuid')
  updatedBy!: string
}

/**
 * Adds soft delete. `deletedAt` and `deletedBy` are set together — every such
 * table has a CHECK enforcing it, so setting one alone fails at the database
 * rather than leaving a row deleted by nobody.
 */
export abstract class SoftDeletableEntity extends TimestampedEntity {
  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt!: Date | null

  @Column('uuid', { nullable: true })
  deletedBy!: string | null
}

/**
 * Timestamps and org scoping, without soft delete — for tables whose retention
 * policy hard-deletes them and which already carry a state column saying they
 * are finished with.
 */
export abstract class OrgScopedEntity extends TimestampedEntity {
  @Column('uuid')
  orgId!: string
}

/**
 * The default. Everything an org owns.
 */
export abstract class BaseEntity extends SoftDeletableEntity {
  @Column('uuid')
  orgId!: string
}
