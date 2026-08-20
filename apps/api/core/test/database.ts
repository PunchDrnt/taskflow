import { join } from 'node:path'
import { DataSource } from 'typeorm'

import { buildDataSourceOptions } from '../src/database/data-source.options'

/**
 * Connection to the throwaway `postgres-test` service from docker-compose.
 *
 * Deliberately not part of the zod schema in `src/config/env.ts`: that schema
 * describes what the *API* reads at boot, and the API must never open a
 * connection to the test database. Tests read it here instead.
 */
export const testDatabaseUrl = process.env.DATABASE_URL_TEST ?? ''

export const hasTestDatabase = testDatabaseUrl.length > 0

/**
 * Every schema the migrations create. Keep in step with CreateSchemas.
 */
const SCHEMAS = [
  'identity',
  'organization',
  'project',
  'task',
  'audit',
  'discussion',
  'field',
  'view',
  'chat',
  'notify',
  'billing',
]

/**
 * Returns the test database to empty so migrations always run from nothing.
 *
 * Without this the suite quietly tests a stale schema. A migration already
 * recorded in the migrations table never runs again, so editing one — which
 * Phase 0 does, since nothing is deployed yet — leaves this database on the
 * old definition while the development one has been rebuilt. The failure then
 * looks like a broken migration rather than a stale database.
 */
async function resetTestDatabase(dataSource: DataSource): Promise<void> {
  for (const schema of SCHEMAS) {
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  }
  await dataSource.query(`DROP TABLE IF EXISTS public.migrations`)
  await dataSource.query(`DROP EXTENSION IF EXISTS citext CASCADE`)
}

/**
 * Opens a connection to the test database with every migration applied to an
 * empty database, so a suite runs against the schema the migrations actually
 * produce rather than one `synchronize` invented. Callers must `destroy()` it.
 */
export async function createMigratedTestDataSource(): Promise<DataSource> {
  if (!hasTestDatabase) {
    throw new Error(
      'DATABASE_URL_TEST is not set. Start the database with ' +
        '`docker compose up -d postgres-test` and copy .env.example to .env.',
    )
  }

  // resetTestDatabase drops every schema it knows about, so it must not be
  // able to reach the development database however DATABASE_URL_TEST is set.
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '')
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to reset "${databaseName}": DATABASE_URL_TEST must point at a ` +
        'database whose name ends in _test.',
    )
  }

  const dataSource = new DataSource({
    ...buildDataSourceOptions(testDatabaseUrl),
    // The runtime options point at compiled migrations in dist/, which is
    // right for the CLI and wrong here — Vitest runs the TypeScript sources.
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
