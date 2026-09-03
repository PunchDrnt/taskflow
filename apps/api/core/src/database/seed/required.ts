import { DataSource } from 'typeorm'

import { SYSTEM_USER_ID } from '#shared/system-user'

import { validateDatabaseUrl } from '../../config/env'
import { SYSTEM_PERMISSIONS } from '../../permission/system-permissions'
import { buildDataSourceOptions } from '../data-source.options'

/**
 * Rows the application needs wherever it runs, production included.
 *
 *     yarn workspace @api/core db:seed:required
 *
 * Distinct from `demo.ts`, which invents a company and refuses to touch a
 * production database. This one is idempotent and safe to run on every deploy,
 * which is what lets it live outside the migrations: a migration must keep
 * doing what it already did on a live database, so it has to repeat its data
 * as a literal. A seed that reruns has no such constraint and can import
 * `SYSTEM_PERMISSIONS` directly — one list, no drift to test for.
 *
 * The system user is the counter-example and stays in a migration: every
 * `created_by` is a RESTRICT foreign key pointing at that row, and other
 * migrations insert rows that reference it.
 */
const DESCRIPTIONS: Record<string, string> = {
  'org.read': 'Read any organisation, across org scope',
  'org.suspend': 'Suspend an organisation',
  'user.impersonate': 'Act as a user inside their organisation',
  'billing.refund': 'Issue a refund',
  'log.read': 'Read the activity log across organisations',
  'role.manage': 'Grant and revoke system roles',
}

export async function seedRequired(dataSource: DataSource): Promise<number> {
  let written = 0

  for (const key of Object.values(SYSTEM_PERMISSIONS)) {
    // DO NOTHING rather than an upsert: a description is the only thing that
    // could change, nothing reads it before Phase 7, and an upsert would
    // silently undo an edit made in the back-office later. Removing a key
    // leaves its row behind, which is the deliberate trade.
    //
    // ON CONFLICT names a unique index, and permissions_key_unique is partial,
    // so its predicate is repeated here.
    const result = (await dataSource.query(
      `
      INSERT INTO identity.permissions (key, description, created_by, updated_by)
      VALUES ($1, $2, $3, $3)
      ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING
      RETURNING id
      `,
      [key, DESCRIPTIONS[key] ?? key, SYSTEM_USER_ID],
    )) as unknown[]

    written += result.length
  }

  return written
}

async function main(): Promise<void> {
  const url = validateDatabaseUrl(process.env)
  const dataSource = new DataSource(buildDataSourceOptions(url))
  await dataSource.initialize()

  try {
    const written = await seedRequired(dataSource)
    console.log(`required seed: ${written} permission(s) inserted`)
  } finally {
    await dataSource.destroy()
  }
}

// Only when run directly, so migrate.ts can import seedRequired.
if (process.argv[1]?.endsWith('required.js')) {
  void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
