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
 * run against the migrated database; if it wants to run anything at all, the
 * entities and the migrations have drifted apart.
 */
describe.skipIf(!hasTestDatabase)('entities match the migrated schema', () => {
  let dataSource: DataSource

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()
  }, 60_000)

  afterAll(async () => {
    await dataSource?.destroy()
  })

  it('has no pending schema changes after running every migration', async () => {
    const pending = await dataSource.driver.createSchemaBuilder().log()

    // The failure message matters more than the assertion here: each query is
    // a concrete statement someone forgot to put in a migration (or an entity
    // that describes a column the migrations never created).
    //
    // When partitioning, partial indexes and `COLLATE "C"` land, expect false
    // positives — the schema builder cannot represent any of them and will
    // propose "fixing" them on every run. The answer is a narrow ignore with a
    // comment naming the specific construct, never a looser assertion.
    expect(pending.upQueries.map((query) => query.query)).toEqual([])
  })

  it('registers every entity it was given', () => {
    expect(dataSource.entityMetadatas).toHaveLength(entities.length)
  })
})
