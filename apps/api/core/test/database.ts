import { join } from 'node:path'
import { DataSource } from 'typeorm'

import { buildDataSourceOptions } from '../src/database/data-source.options'

/**
 * The throwaway `postgres-test` service. Not in `src/config/env.ts`: that
 * schema is what the API reads at boot, and the API must never connect here.
 */
const testDatabaseUrl = process.env.DATABASE_URL_TEST ?? ''

export const hasTestDatabase = testDatabaseUrl.length > 0

/**
 * Every schema the migrations create. Keep in step with CreateSchemas.
 */
const SCHEMAS = [
  'iam',
  'organization',
  'project',
  'task',
  'audit',
  'discussion',
  'field',
  'view',
  'chat',
  'automation',
  'notify',
  'billing',
]

/**
 * Empties the database so migrations always run from nothing.
 *
 * Without this the suite quietly tests a stale schema: a migration already
 * recorded never runs again, so editing one — which Phase 0 does freely —
 * leaves this database behind, and the failure looks like a broken migration
 * rather than a stale database.
 */
async function resetTestDatabase(dataSource: DataSource): Promise<void> {
  for (const schema of SCHEMAS) {
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  }
  await dataSource.query(`DROP TABLE IF EXISTS public.migrations`)
  await dataSource.query(`DROP EXTENSION IF EXISTS citext CASCADE`)
}

/**
 * Connects with every migration applied from empty, so a suite runs against
 * the schema the migrations produce. Callers must `destroy()` it.
 */
export async function createMigratedTestDataSource(): Promise<DataSource> {
  if (!hasTestDatabase) {
    throw new Error(
      'DATABASE_URL_TEST is not set. Start the database with ' +
        '`docker compose up -d postgres-test` and copy .env.example to .env.',
    )
  }

  // resetTestDatabase drops schemas, so it must not be able to reach the
  // development database however DATABASE_URL_TEST is set.
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '')
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to reset "${databaseName}": DATABASE_URL_TEST must point at a ` +
        'database whose name ends in _test.',
    )
  }

  const dataSource = new DataSource({
    ...buildDataSourceOptions(testDatabaseUrl),
    // The runtime options point at dist/; Vitest runs the TypeScript sources.
    migrations: [
      join(__dirname, '..', 'src', 'database', 'migrations', '*.ts'),
    ],
    logging: ['error'],
  })

  await dataSource.initialize()
  await resetTestDatabase(dataSource)
  await dataSource.runMigrations({ transaction: 'all' })

  return dataSource
}
