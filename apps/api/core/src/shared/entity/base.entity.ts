import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

/**
 * The columns every table carries, in the six shapes the schema uses.
 * `org_id`, soft delete, and whether a row is ever edited after it is created
 * are three independent axes; which table takes which is in
 * docs/02-database.md#base-entity--on-every-table-with-four-named-exceptions.
 *
 * | Class                    | org_id | soft delete | updatable | Used by                            |
 * | ------------------------ | ------ | ----------- | --------- | ----------------------------------- |
 * | `BaseEntity`              | yes    | yes         | yes       | anything a person deletes and may   |
 * |                          |        |             |           | want back — tasks, projects, teams  |
 * | `SoftDeletableEntity`     | no     | yes         | yes       | identity.users, organizations, plans |
 * | `OrgScopedEntity`         | yes    | no          | yes       | notify.outbox, billing.ai_usage,    |
 * |                          |        |             |           | organization.members, team_members, |
 * |                          |        |             |           | project.members — a `role` column   |
 * |                          |        |             |           | on the last three is what makes     |
 * |                          |        |             |           | them updatable                       |
 * | `TimestampedEntity`       | no     | no          | yes       | sessions, password_reset_tokens     |
 * | `CreatedEntity`           | no     | no          | no        | identity.role_permissions,          |
 * |                          |        |             |           | identity.user_roles                 |
 * | `OrgScopedCreatedEntity`  | yes    | no          | no        | task.assignees                      |
 *
 * Dates say `timestamptz` explicitly: TypeORM's default is `timestamp`, which
 * would silently reinterpret every value.
 */
export abstract class CreatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  /** Filled by AuditColumnsSubscriber from the request context. */
  @Column('uuid')
  createdBy!: string
}

/**
 * Adds `updatedAt`/`updatedBy`, for a row something can change after it is
 * created. Not every table qualifies — see `CreatedEntity` for the ones that
 * don't, where those two columns would forever equal the created pair.
 */
export abstract class TimestampedEntity extends CreatedEntity {
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

/**
 * `CreatedEntity` plus `org_id`, for a row nothing ever edits — only creates
 * or removes. Assigning a task to someone is a fact that either holds or
 * doesn't; there is no in-between state to update, so `updatedAt` and
 * `updatedBy` would sit there always equal to `createdAt`/`createdBy`,
 * carrying an `ON DELETE RESTRICT` foreign key that never earns its keep.
 * Delete and recreate the row rather than editing one in place — if that
 * stops being true for a table, it belongs on `OrgScopedEntity` instead.
 */
export abstract class OrgScopedCreatedEntity extends CreatedEntity {
  @Column('uuid')
  orgId!: string
}
