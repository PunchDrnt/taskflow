import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

/**
 * The columns every table carries, in the four shapes the schema uses.
 * `org_id` and soft delete are independent axes; which table takes which is in
 * docs/02-database.md#base-entity--on-every-table-with-three-named-exceptions.
 *
 * | Class                 | org_id | soft delete | Used by                          |
 * | --------------------- | ------ | ----------- | -------------------------------- |
 * | `BaseEntity`          | yes    | yes         | almost everything                |
 * | `SoftDeletableEntity` | no     | yes         | identity.*, organizations, plans |
 * | `OrgScopedEntity`     | yes    | no          | notify.outbox                    |
 * | `TimestampedEntity`   | no     | no          | sessions, password_reset_tokens  |
 *
 * Dates say `timestamptz` explicitly: TypeORM's default is `timestamp`, which
 * would silently reinterpret every value.
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

/** `deletedAt` and `deletedBy` are set together — a CHECK on every such table. */
export abstract class SoftDeletableEntity extends TimestampedEntity {
  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt!: Date | null

  @Column('uuid', { nullable: true })
  deletedBy!: string | null
}

/** For tables retention hard-deletes, which already track their own end. */
export abstract class OrgScopedEntity extends TimestampedEntity {
  @Column('uuid')
  orgId!: string
}

/** The default. Everything an org owns. */
export abstract class BaseEntity extends SoftDeletableEntity {
  @Column('uuid')
  orgId!: string
}
