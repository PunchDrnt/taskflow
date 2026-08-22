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
 * docs/02-database.md#base-entity--on-every-table-with-four-named-exceptions.
 *
 * | Class                 | org_id | soft delete | Used by                              |
 * | --------------------- | ------ | ----------- | ------------------------------------ |
 * | `BaseEntity`          | yes    | yes         | anything a person deletes and may     |
 * |                       |        |             | want back — tasks, projects, teams    |
 * | `SoftDeletableEntity` | no     | yes         | identity.users, organizations, plans  |
 * | `OrgScopedEntity`     | yes    | no          | notify.outbox, and the join tables:   |
 * |                       |        |             | organization.members, team_members,   |
 * |                       |        |             | project.members, task.assignees,      |
 * |                       |        |             | billing.ai_usage                      |
 * | `TimestampedEntity`   | no     | no          | sessions, password_reset_tokens,      |
 * |                       |        |             | identity.role_permissions, user_roles |
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

/**
 * Hard delete, for two kinds of table.
 *
 * Ones that track their own end (`notify.outbox.status`) and would otherwise
 * carry a second delete marker to keep in sync. And **join tables** —
 * membership and assignment — where removing a row is a relationship changing
 * rather than data being destroyed: re-adding costs nothing, so there is
 * nothing to restore, and `audit.logs` already records who removed whom.
 *
 * The deciding reason is narrower than either: on a join table a query that
 * forgets `deleted_at IS NULL` is an access-control bug, not a display one —
 * a soft-deleted `project.members` row means someone removed from a project
 * can still reach it. Hard delete leaves nothing to forget.
 *
 * Cascade deliberately does not reach these (see cascade-soft-delete.ts), so a
 * soft-deleted project still has its members and comes back whole; the FKs are
 * `ON DELETE CASCADE`, so retention's hard delete clears them for real.
 */
export abstract class OrgScopedEntity extends TimestampedEntity {
  @Column('uuid')
  orgId!: string
}

/** The default. Everything an org owns. */
export abstract class BaseEntity extends SoftDeletableEntity {
  @Column('uuid')
  orgId!: string
}
