import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MAX_TASK_DEPTH } from '@repo/shared'

import { SYSTEM_USER_ID } from '#shared/system-user'

import { SYSTEM_PERMISSIONS } from '../src/permission/system-permissions'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

/**
 * Facts the schema and the application both depend on, where nothing else
 * would notice them drifting apart.
 */
describe.skipIf(!hasTestDatabase)('schema invariants', () => {
  let dataSource: DataSource

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()
  }, 60_000)

  afterAll(async () => {
    await dataSource?.destroy()
  })

  it('enforces MAX_TASK_DEPTH in the database, at the value the app uses', async () => {
    const [constraint] = (await dataSource.query(
      `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint WHERE conname = 'tasks_depth_within_limit_check'`,
    )) as { definition: string }[]

    // The migration spells the number out — deliberately, since a migration
    // that changes when a shared constant is edited is not a record of what
    // was done. This is what stops the two from parting company silently.
    expect(constraint?.definition).toContain(`depth <= ${MAX_TASK_DEPTH}`)
  })

  it('rejects a task deeper than MAX_TASK_DEPTH', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO task.tasks
           (org_id, project_id, title, status_id, sort_order, depth, parent_task_id, created_by, updated_by)
         VALUES
           (gen_random_uuid(), gen_random_uuid(), 't', gen_random_uuid(), 'a0', $1,
            gen_random_uuid(), $2, $2)`,
        [MAX_TASK_DEPTH + 1, SYSTEM_USER_ID],
      ),
    ).rejects.toThrow(/tasks_depth_within_limit_check/)
  })

  it('seeds the system user at the id the application writes as', async () => {
    // The migration spells the uuid out rather than importing SYSTEM_USER_ID,
    // for the same reason the depth CHECK spells its number out. This is what
    // catches the two parting company — and they part company silently, as a
    // foreign key violation on created_by in whichever job writes first.
    const [seeded] = (await dataSource.query(
      `SELECT id FROM identity.users WHERE is_system`,
    )) as { id: string }[]

    expect(seeded?.id).toBe(SYSTEM_USER_ID)
  })

  it('seeds exactly the system permission keys the code names', async () => {
    // Same shape as above: the migration lists the keys literally so editing
    // SYSTEM_PERMISSIONS cannot change what it already did on a live
    // database. Nothing reads these until Phase 7, which is exactly why a
    // key added to one side and not the other would go unnoticed for months.
    const rows = (await dataSource.query(
      `SELECT key FROM identity.permissions WHERE deleted_at IS NULL ORDER BY key`,
    )) as { key: string }[]

    expect(rows.map((row) => row.key)).toEqual(
      [...Object.values(SYSTEM_PERMISSIONS)].sort(),
    )
  })
})
