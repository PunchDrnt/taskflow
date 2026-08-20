import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { entities } from '../src/database/entities'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

/**
 * `synchronize` is off forever, so nothing reconciles entities against the
 * database — an entity can declare a column no migration created, and nothing
 * complains until a query fails in production.
 *
 * This asks the schema builder what `synchronize` would run against the
 * migrated database. Any statement touching a column means they have drifted.
 */

/**
 * Statements about columns. Everything else the schema builder proposes is
 * about a constraint or an index.
 */
const COLUMN_STATEMENT =
  /\b(ADD "[a-z_]+"|DROP COLUMN|ALTER COLUMN|ADD COLUMN|RENAME COLUMN)/i

/**
 * Constraints, indexes and foreign keys live in migrations and are absent from
 * the entities on purpose, so the schema builder always wants to drop them —
 * no entity declares a relation for `created_by` (that would import identity's
 * User into every module), and partial indexes and CHECKs are things
 * `synchronize` cannot express anyway.
 *
 * Not a loosened assertion: column mismatches are what this catches, and they
 * are still fatal.
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

    // Each entry is a column missing from a migration, or one an entity
    // describes that no migration created.
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
