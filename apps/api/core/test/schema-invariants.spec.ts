import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MAX_TASK_DEPTH } from '@repo/shared'

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
        [MAX_TASK_DEPTH + 1, '00000000-0000-0000-0000-000000000000'],
      ),
    ).rejects.toThrow(/tasks_depth_within_limit_check/)
  })
})
