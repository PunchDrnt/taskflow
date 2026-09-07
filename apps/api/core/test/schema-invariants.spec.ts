import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MAX_TASK_DEPTH } from '@repo/shared'

import { SYSTEM_USER_ID } from '#shared/system-user'

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
           (org_id, project_id, title, number, status_id, sort_order, depth,
            parent_task_id, created_by, updated_by)
         VALUES
           (gen_random_uuid(), gen_random_uuid(), 't', 1, gen_random_uuid(), 'a0', $1,
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
      `SELECT id FROM iam.users WHERE is_system`,
    )) as { id: string }[]

    expect(seeded?.id).toBe(SYSTEM_USER_ID)
  })

  /**
   * A limited-value column that leads a unique index needs a CHECK, because a
   * wrong value does not fail — it lands in a different bucket and the index
   * quietly stops enforcing what it was created for.
   *
   * Guarded here rather than by `schema-drift.spec.ts`, which reconciles
   * columns against entity metadata and never sees a constraint. Losing one of
   * these is silent in both directions: no test fails, and nothing goes wrong
   * until two rows exist that should not.
   *
   * `chat.*` is Phase 2 and absent for now — the loop skips what does not
   * exist yet rather than hard-coding today's table list.
   *
   * See docs/02-database/README.md#check-vs-enum
   */
  it('constrains the limited-value columns that lead a unique index', async () => {
    const guarded = [
      { table: 'task.assignees', column: 'assignee_type' },
      { table: 'chat.identities', column: 'platform' },
      { table: 'chat.channels', column: 'platform' },
    ]

    for (const { table, column } of guarded) {
      const [schema, name] = table.split('.')

      const [existing] = (await dataSource.query(
        `SELECT to_regclass($1) IS NOT NULL AS present`,
        [table],
      )) as { present: boolean }[]

      if (!existing?.present) continue

      const checks = (await dataSource.query(
        `SELECT pg_get_constraintdef(c.oid) AS definition
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.contype = 'c' AND n.nspname = $1 AND t.relname = $2`,
        [schema, name],
      )) as { definition: string }[]

      expect(
        checks.some((check) => check.definition.includes(column)),
        `${table}.${column} has no CHECK — the unique index it leads is not enforcing what it looks like it enforces`,
      ).toBe(true)
    }
  })
})
