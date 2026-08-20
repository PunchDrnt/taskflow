import type { DataSource } from 'typeorm'

/**
 * How long each kind of data lives, from docs/01-architecture.md. Policy
 * rather than deployment config: changing one is a change to the document.
 * `audit.logs` is absent because it is never deleted.
 */
export const RETENTION_DAYS = {
  softDeleted: 90,
  pendingDeletionUser: 30,
  sentNotification: 30,
  finishedSession: 7,
  passwordResetToken: 1,
} as const

/** An unbounded DELETE locks every row it touches until it commits. */
export const PURGE_BATCH_SIZE = 1_000

/**
 * Every `created_by` points at `identity.users` with RESTRICT, so users are
 * anonymised rather than removed. A sweep that tried would succeed only on
 * people who had created nothing yet.
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
 * Every soft-deletable table, ordered so the deletes never hit a foreign key.
 *
 * Read from the catalog, not kept as a list here: a hand-written order fails
 * in a way nothing detects — a forgotten table is rows that are never purged,
 * and a misplaced one only breaks the first day real data turns ninety days
 * old. `task.tasks` → `project.projects` is RESTRICT, so the order is load-
 * bearing rather than tidiness.
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
      -- p.oid <> t.oid drops self-references (tasks.parent_task_id): cycles in
      -- the graph, but not in the deletion — same table, and CASCADE.
      LEFT JOIN pg_constraint con ON con.conrelid = t.oid AND con.contype = 'f'
      LEFT JOIN purgeable p ON p.oid = con.confrelid AND p.oid <> t.oid
     GROUP BY t.name, t.qualified
     ORDER BY t.name
    `,
    [NEVER_PURGED],
  )) as CatalogRow[]

  return sortChildrenFirst(rows)
}

/** Kahn's algorithm: a table is ready once nothing left in the set points at it. */
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
