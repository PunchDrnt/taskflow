import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, type EntityManager } from 'typeorm'

import { requireOrgContext } from '../org-scope/request-context'

interface ChildLink {
  /** `schema.table`. */
  table: string
  /** The column on the child holding the parent's id. */
  column: string
  /** For polymorphic children, the `entity_type` value naming this parent. */
  entityType?: string
}

/**
 * What belongs to what, for the purpose of deleting it.
 *
 * The database cannot answer this. `ON DELETE CASCADE` describes a hard
 * delete, and `tasks.project_id` is deliberately RESTRICT — a project holding
 * tasks must be emptied on purpose — which says nothing about whether tasks
 * belong to it. `NOT NULL` does not answer it either: `tasks.status_id` is NOT
 * NULL, and deleting a status moves its tasks rather than deleting them.
 *
 * So it is declared, and `test/cascade-soft-delete.spec.ts` asserts every
 * soft-deletable table appears here or in ROOTS. Adding a table forces the
 * question rather than leaving its rows to outlive their parent.
 */
export const AGGREGATE_CHILDREN: Record<string, ChildLink[]> = {
  'organization.organizations': [
    { table: 'organization.teams', column: 'org_id' },
    { table: 'project.projects', column: 'org_id' },
    { table: 'billing.subscriptions', column: 'org_id' },
    { table: 'billing.ai_wallet', column: 'org_id' },
  ],
  'project.projects': [
    { table: 'project.statuses', column: 'project_id' },
    { table: 'project.sprints', column: 'project_id' },
    { table: 'task.tasks', column: 'project_id' },
    { table: 'field.definitions', column: 'project_id' },
    { table: 'view.views', column: 'project_id' },
  ],
  'task.tasks': [
    // A sub-task is a task, so this recurses into itself until none are left.
    { table: 'task.tasks', column: 'parent_task_id' },
    { table: 'discussion.comments', column: 'entity_id', entityType: 'task' },
    {
      table: 'discussion.attachments',
      column: 'entity_id',
      entityType: 'task',
    },
  ],
  'discussion.comments': [
    { table: 'discussion.comments', column: 'parent_comment_id' },
  ],
  'view.views': [{ table: 'view.columns', column: 'view_id' }],
}

/**
 * Soft-deletable tables that belong to nobody, so nothing cascades into them.
 * Listed rather than implied, so the coverage test can tell "a root" from
 * "forgotten".
 */
export const ROOTS = [
  'organization.organizations',
  'billing.plans',
  // identity is outside org scoping and has its own lifecycle: a user is
  // anonymised, never soft-deleted through an aggregate.
  'identity.users',
  'identity.roles',
  'identity.permissions',
]

/**
 * Soft-deletes a row and everything that belongs to it, in one transaction.
 *
 * `ON DELETE CASCADE` only fires on a hard delete, so without this a deleted
 * project keeps its tasks — which then outlive it in every list that reads
 * tasks directly, and jam the retention purge ninety days later, since
 * `tasks.project_id` is RESTRICT.
 */
@Injectable()
export class CascadeSoftDelete {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Returns the rows soft-deleted per table, the root included. An id that
   * belongs to another org, or a row already deleted, touches nothing and
   * returns `{}`.
   *
   * Named for what it does rather than for the class it sits on: at the call
   * site `cascade.delete(...)` reads like the hard delete this is not.
   */
  async softDelete(table: string, id: string): Promise<Record<string, number>> {
    const { orgId, userId } = requireOrgContext()

    return this.dataSource.transaction(async (manager) => {
      const deleted: Record<string, number> = {}

      const roots = await this.markDeleted(manager, {
        table,
        where: `id = $3`,
        parameters: [id],
        orgId,
        userId,
      })

      if (roots.length === 0) return deleted
      deleted[table] = roots.length

      await this.descend(manager, table, roots, orgId, userId, deleted)
      return deleted
    })
  }

  private async descend(
    manager: EntityManager,
    parent: string,
    parentIds: string[],
    orgId: string,
    userId: string,
    deleted: Record<string, number>,
  ): Promise<void> {
    for (const child of AGGREGATE_CHILDREN[parent] ?? []) {
      const parameters: unknown[] = [parentIds]
      let where = `${child.column} = ANY($3::uuid[])`

      if (child.entityType) {
        parameters.push(child.entityType)
        where += ` AND entity_type = $4`
      }

      const ids = await this.markDeleted(manager, {
        table: child.table,
        where,
        parameters,
        orgId,
        userId,
      })

      if (ids.length === 0) continue
      deleted[child.table] = (deleted[child.table] ?? 0) + ids.length

      await this.descend(manager, child.table, ids, orgId, userId, deleted)
    }
  }

  /**
   * One UPDATE, scoped to the org and skipping rows already deleted — so a
   * second pass does not rewrite who deleted a row or when, and does not walk
   * into children that went with it the first time.
   */
  private async markDeleted(
    manager: EntityManager,
    query: {
      table: string
      where: string
      parameters: unknown[]
      orgId: string
      userId: string
    },
  ): Promise<string[]> {
    // organization.organizations has no org_id — its would always equal id.
    const orgColumn =
      query.table === 'organization.organizations' ? 'id' : 'org_id'

    // Not every soft-deletable table has the update pair —
    // discussion.attachments is uploaded and removed, never edited
    // (OrgScopedCreatedSoftDeletableEntity). Read from the entity metadata
    // rather than a second hand-written list, so a new table of that shape
    // cannot be forgotten here.
    const setUpdated = this.hasUpdateColumns(query.table)
      ? ', updated_at = now(), updated_by = $1'
      : ''

    // UPDATE ... RETURNING hands back [rows, affected], not rows — reading it
    // as an array of rows yields two undefined ids and a recursion that never
    // matches anything.
    const [rows] = (await manager.query(
      `UPDATE ${query.table}
          SET deleted_at = now(), deleted_by = $1${setUpdated}
        WHERE ${orgColumn} = $2
          AND deleted_at IS NULL
          AND ${query.where}
        RETURNING id`,
      [query.userId, query.orgId, ...query.parameters],
    )) as [{ id: string }[], number]

    return rows.map((row) => row.id)
  }

  /** Whether `schema.table` carries `updated_at`/`updated_by`. */
  private hasUpdateColumns(table: string): boolean {
    const metadata = this.dataSource.entityMetadatas.find(
      (entity) => `${entity.schema ?? ''}.${entity.tableName}` === table,
    )

    // An unknown table keeps the old behaviour rather than quietly writing
    // fewer columns than intended; every table here has an entity today.
    return (
      metadata === undefined ||
      metadata.columns.some((column) => column.propertyName === 'updatedAt')
    )
  }
}
