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
 * Opens a connection to the test database with migrations applied, so a suite
 * runs against the schema the migrations actually produce rather than one
 * `synchronize` invented. Callers must `destroy()` it.
 */
export async function createMigratedTestDataSource(): Promise<DataSource> {
  if (!hasTestDatabase) {
    throw new Error(
      'DATABASE_URL_TEST is not set. Start the database with ' +
        '`docker compose up -d postgres-test` and copy .env.example to .env.',
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
  await dataSource.runMigrations({ transaction: 'all' })

  return dataSource
}
