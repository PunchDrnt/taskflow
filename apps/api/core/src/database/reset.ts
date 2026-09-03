import { DataSource } from 'typeorm'

import { validateDatabaseUrl } from '../config/env'
import { buildDataSourceOptions } from './data-source.options'
import { seedRequired } from './seed/required'

/**
 * Drops every schema the migrations create, then reapplies them from empty.
 *
 *     yarn workspace @api/core db:reset
 *
 * For when a migration file changes after the database already recorded it
 * as run — normal before anything is deployed, when a migration is edited in
 * place rather than followed by a new one. Without this the dev database
 * quietly keeps the old shape: `migration:run` sees every migration already
 * in `public.migrations` and does nothing. Mirrors test/database.ts's reset,
 * which the integration suite runs before every file for the same reason.
 *
 * Refuses a production database, the same guard db:seed uses — this is a
 * destructive command for a local Postgres, not a deploy tool.
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
  'automation',
  'notify',
  'billing',
]

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset a production database')
  }

  const url = validateDatabaseUrl(process.env)
  const dataSource = new DataSource(buildDataSourceOptions(url))
  await dataSource.initialize()

  try {
    for (const schema of SCHEMAS) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    }
    await dataSource.query(`DROP TABLE IF EXISTS public.migrations`)
    await dataSource.query(`DROP EXTENSION IF EXISTS citext CASCADE`)

    const applied = await dataSource.runMigrations({ transaction: 'all' })
    // The permission keys live in the required seed rather than in a
    // migration, so a reset that stopped here would leave them missing.
    const written = await seedRequired(dataSource)
    console.log(
      `reset and reapplied ${applied.length} migrations, ` +
        `seeded ${written} permission(s)`,
    )
  } finally {
    await dataSource.destroy()
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
