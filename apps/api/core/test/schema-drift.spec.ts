import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { entities } from '../src/database/entities'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

/**
 * Migrations are the source of truth for the schema — `synchronize` is off
 * forever, so TypeORM never reconciles the two. That leaves a gap Prisma does
 * not have: an entity can declare a column no migration ever created, or miss
 * one that exists, and nothing complains until a query fails in production.
 *
 * This closes it. The schema builder computes exactly what `synchronize` would
 * run against the migrated database, and any statement that touches a column
 * means the entities and the migrations have drifted apart.
 */

/**
 * Statements about columns. Everything else the schema builder proposes is
 * about a constraint or an index.
 */
const COLUMN_STATEMENT =
  /\b(ADD "[a-z_]+"|DROP COLUMN|ALTER COLUMN|ADD COLUMN|RENAME COLUMN)/i

/**
 * Constraints, indexes and foreign keys live in migrations and are absent from
 * the entities on purpose, so the schema builder always wants to drop them:
 *
 * - No entity declares a relation for `created_by` and friends. Doing so would
 *   import identity's User into every module, which the module boundary rules
 *   forbid — a service wanting a name calls UserService, it does not join.
 * - Partial indexes, CHECK constraints and `UNIQUE (id, org_id)` are things
 *   `synchronize` cannot express, which is why it is off.
 *
 * Ignoring them is not a loosened assertion: what this test exists to catch is
 * a column mismatch, and those are still fatal.
 */
function isColumnDrift(query: string): boolean {
  return COLUMN_STATEMENT.test(query)
}

describe.skipIf(!hasTestDatabase)('entities match the migrated schema', () => {
  let dataSource: DataSource

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()
  }, 60_000)

  afterAll(async () => {
    await dataSource?.destroy()
  })

  it('has no column differences after running every migration', async () => {
    const pending = await dataSource.driver.createSchemaBuilder().log()
    const drift = pending.upQueries
      .map((query) => query.query)
      .filter(isColumnDrift)

    // Each entry is a column someone forgot to put in a migration, or an
    // entity describing a column the migrations never created.
    expect(drift).toEqual([])
  })

  it('registers every entity it was given', () => {
    expect(dataSource.entityMetadatas).toHaveLength(entities.length)
  })

  it('maps camelCase properties onto the snake_case columns that exist', async () => {
    for (const metadata of dataSource.entityMetadatas) {
      const declared = metadata.columns.map((column) => column.databaseName)
      const actual: { column_name: string }[] = await dataSource.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2`,
        [metadata.schema, metadata.tableName],
      )
      const existing = new Set(actual.map((row) => row.column_name))

      expect(
        declared.filter((column) => !existing.has(column)),
        `${metadata.schema}.${metadata.tableName} declares columns the database does not have`,
      ).toEqual([])
    }
  })
})
