import type { DataSource } from 'typeorm'

/**
 * How long each kind of data lives.
 *
 * These are the numbers from
 * .claude/docs/01-architecture.md#retention--each-kind-of-data-has-its-own-lifetime
 * and they are policy, not deployment configuration — an environment where
 * sessions survive a year is not a differently-tuned deployment, it is a
 * different promise to the people whose data it is. Changing one is a change
 * to the document.
 *
 * `audit.logs` is absent on purpose: it is never deleted.
 */
export const RETENTION_DAYS = {
  /** Soft-deleted rows, on every table that has `deleted_at`. The bin. */
  softDeleted: 90,
  /** A user who asked to be deleted, measured from the request. */
  pendingDeletionUser: 30,
  /** Notifications already delivered. */
  sentNotification: 30,
  /** Sessions past their expiry or explicitly revoked. */
  finishedSession: 7,
  /** Password reset tokens, which are only valid for ten minutes anyway. */
  passwordResetToken: 1,
} as const

/**
 * Rows deleted per statement.
 *
 * A single unbounded `DELETE` holds locks on every row it touches until it
 * commits. That is invisible at twenty users and unpleasant the first time
 * somebody purges an org's history, so the sweep loops in batches instead.
 */
export const PURGE_BATCH_SIZE = 1_000

/**
 * Tables with `deleted_at` that the sweep must never hard-delete.
 *
 * `identity.users` is the whole list. Every table's `created_by` points at it
 * with `ON DELETE RESTRICT`, which is the decision that history survives the
 * people in it — so a user is *anonymised* (see
 * `RetentionService.anonymisePendingDeletionUsers`), never removed. A sweep
 * that tried would either fail on the foreign key or, worse, succeed on a user
 * who happened to have created nothing yet, making the behaviour depend on
 * how much work someone did before they left.
 */
export const NEVER_PURGED = ['identity.users']

export interface PurgeTarget {
  /** `schema.table`, for logs and tests. */
  name: string
  /** The same, quoted for interpolation into SQL. */
  qualified: string
}

interface CatalogRow extends PurgeTarget {
  /** Tables in the purge set this one points at with a foreign key. */
  parents: string[]
}

/**
 * Every soft-deletable table, ordered so that deleting them in sequence never
 * hits a foreign key.
 *
 * Read from the catalog rather than kept as a list in this file. A hand-written
 * order is wrong in a way nothing detects: adding a table and forgetting to
 * place it leaves rows that are never purged, and misplacing one only fails on
 * the first day real data reaches ninety days old. The catalog always describes
 * the schema that exists.
 *
 * Most parent-child foreign keys here are `CASCADE`, so deleting the parent
 * would take the children anyway — but not all of them: `task.tasks` points at
 * `project.projects` with `RESTRICT`, so tasks genuinely have to go first.
 */
export async function resolvePurgeOrder(
  dataSource: DataSource,
): Promise<PurgeTarget[]> {
  const rows = (await dataSource.query(
    `
    WITH purgeable AS (
      SELECT c.oid,
             n.nspname || '.' || c.relname AS name,
             quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS qualified
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind = 'r'
         AND n.nspname NOT IN ('pg_catalog', 'information_schema')
         AND EXISTS (
               SELECT 1 FROM pg_attribute a
                WHERE a.attrelid = c.oid
                  AND a.attname = 'deleted_at'
                  AND NOT a.attisdropped
             )
         AND n.nspname || '.' || c.relname <> ALL ($1::text[])
    )
    SELECT t.name,
           t.qualified,
           coalesce(
             array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL),
             '{}'
           ) AS parents
      FROM purgeable t
      -- Self-references (tasks.parent_task_id, comments.parent_comment_id) are
      -- excluded by p.oid <> t.oid: they are cycles in the graph but not in the
      -- deletion, since both rows live in the same table and both are CASCADE.
      LEFT JOIN pg_constraint con ON con.conrelid = t.oid AND con.contype = 'f'
      LEFT JOIN purgeable p ON p.oid = con.confrelid AND p.oid <> t.oid
     GROUP BY t.name, t.qualified
     ORDER BY t.name
    `,
    [NEVER_PURGED],
  )) as CatalogRow[]

  return sortChildrenFirst(rows)
}

/**
 * Kahn's algorithm over "this table points at that one".
 *
 * A table can be deleted once nothing left in the set references it, so the
 * count tracked per table is how many of its children are still waiting.
 */
function sortChildrenFirst(rows: CatalogRow[]): PurgeTarget[] {
  const remaining = new Map(rows.map((row) => [row.name, row]))
  const childCount = new Map(rows.map((row) => [row.name, 0]))

  for (const row of rows) {
    for (const parent of row.parents) {
      childCount.set(parent, (childCount.get(parent) ?? 0) + 1)
    }
  }

  const ordered: PurgeTarget[] = []

  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter(
      (row) => childCount.get(row.name) === 0,
    )

    if (ready.length === 0) {
      throw new Error(
        'Cannot order the retention sweep: these tables reference each other ' +
          `in a cycle — ${[...remaining.keys()].join(', ')}. Deleting them ` +
          'safely needs a deferrable foreign key or a deliberate order.',
      )
    }

    for (const row of ready) {
      ordered.push({ name: row.name, qualified: row.qualified })
      remaining.delete(row.name)
      for (const parent of row.parents) {
        childCount.set(parent, (childCount.get(parent) ?? 1) - 1)
      }
    }
  }

  return ordered
}
