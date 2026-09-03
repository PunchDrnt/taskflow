import { DataSource } from 'typeorm'

import { validateDatabaseUrl } from '../config/env'
import { buildDataSourceOptions } from './data-source.options'
import { seedRequired } from './seed/required'

/**
 * What the `api-migrate` container runs: migrations, then the required seed.
 *
 * One entrypoint rather than two commands, because Compose's `command` is an
 * exec array with no shell — `sh -c "a && b"` would work but puts the ordering
 * in a string nothing type-checks. `migrationsRun` stays false so the API
 * itself never migrates on boot.
 *
 * Reads only DATABASE_URL, via validateDatabaseUrl: a migration must not be
 * blocked on a Resend key it does not read.
 */
async function main(): Promise<void> {
  const url = validateDatabaseUrl(process.env)
  const dataSource = new DataSource(buildDataSourceOptions(url))
  await dataSource.initialize()

  try {
    const applied = await dataSource.runMigrations({ transaction: 'all' })
    console.log(`applied ${applied.length} migration(s)`)

    const written = await seedRequired(dataSource)
    console.log(`required seed: ${written} permission(s) inserted`)
  } finally {
    await dataSource.destroy()
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
