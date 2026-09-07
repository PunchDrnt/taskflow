import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { LOCK_KEYS, withAdvisoryLock } from '#shared/jobs/advisory-lock'
import { SYSTEM_USER_ID } from '#shared/system-user'

import { AuditPartitionService } from '../src/maintenance/audit-partition.service'
import {
  NEVER_PURGED,
  resolvePurgeOrder,
} from '../src/maintenance/retention.policy'
import { RetentionService } from '../src/maintenance/retention.service'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

/**
 * Retention deletes data on a timer with nobody watching, which makes both
 * failure modes quiet: deleting too much is noticed once, months later, and
 * deleting nothing is never noticed at all.
 *
 * Everything here runs against a real Postgres, because what is being tested
 * is whether the foreign keys let the deletes through in the order the job
 * chooses — a question a mock cannot answer.
 *
 * See .claude/docs/01-architecture.md#retention--each-kind-of-data-has-its-own-lifetime
 */
describe.skipIf(!hasTestDatabase)('retention', () => {
  let dataSource: DataSource
  let retention: RetentionService
  let auditPartitions: AuditPartitionService

  /** Rows are dated by hand: the suite cannot wait ninety days. */
  const daysAgo = (days: number): string =>
    `now() - make_interval(days => ${days})`

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()
    retention = new RetentionService(dataSource)
    auditPartitions = new AuditPartitionService(dataSource)
  }, 60_000)

  afterAll(async () => {
    await dataSource?.destroy()
  })

  describe('the order tables are purged in', () => {
    it('covers every soft-deletable table except the ones excluded by name', async () => {
      const order = await resolvePurgeOrder(dataSource)

      const softDeletable = (await dataSource.query(
        `SELECT n.nspname || '.' || c.relname AS name
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN pg_attribute a ON a.attrelid = c.oid
                              AND a.attname = 'deleted_at'
                              AND NOT a.attisdropped
          WHERE c.relkind = 'r'
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')`,
      )) as { name: string }[]

      const expected = softDeletable
        .map((row) => row.name)
        .filter((name) => !NEVER_PURGED.includes(name))

      // A table added without a thought for retention is the failure this
      // catches: its rows would sit soft-deleted forever.
      expect(order.map((target) => target.name).sort()).toEqual(expected.sort())
    })

    it('places every table before the ones it points at', async () => {
      const order = await resolvePurgeOrder(dataSource)
      const position = new Map(
        order.map((target, index) => [target.name, index]),
      )

      const edges = (await dataSource.query(
        `SELECT n.nspname || '.' || c.relname  AS child,
                fn.nspname || '.' || fc.relname AS parent
           FROM pg_constraint con
           JOIN pg_class c       ON c.oid = con.conrelid
           JOIN pg_namespace n   ON n.oid = c.relnamespace
           JOIN pg_class fc      ON fc.oid = con.confrelid
           JOIN pg_namespace fn  ON fn.oid = fc.relnamespace
          WHERE con.contype = 'f'
            AND con.conrelid <> con.confrelid`,
      )) as { child: string; parent: string }[]

      for (const edge of edges) {
        const child = position.get(edge.child)
        const parent = position.get(edge.parent)
        if (child === undefined || parent === undefined) continue

        expect(
          child,
          `${edge.child} must be purged before ${edge.parent}`,
        ).toBeLessThan(parent)
      }
    })

    it('never purges iam.users', async () => {
      const order = await resolvePurgeOrder(dataSource)

      // Every created_by in the schema points here with RESTRICT: users are
      // anonymised, not removed, so history keeps an author.
      expect(order.map((target) => target.name)).not.toContain('iam.users')
    })
  })

  describe('soft-deleted rows', () => {
    beforeEach(async () => {
      await dataSource.query(`DELETE FROM task.tasks`)
      await dataSource.query(`DELETE FROM project.statuses`)
      await dataSource.query(`DELETE FROM project.projects`)
      await dataSource.query(`DELETE FROM organization.organizations`)
    })

    /** An org with one project, one status and one task, all soft-deleted. */
    const seedDeletedTree = async (
      slug: string,
      age: number,
    ): Promise<void> => {
      const [org] = (await dataSource.query(
        `INSERT INTO organization.organizations
           (name, slug, created_by, updated_by, deleted_at, deleted_by)
         VALUES ($1, $1, $2, $2, ${daysAgo(age)}, $2)
         RETURNING id`,
        [slug, SYSTEM_USER_ID],
      )) as { id: string }[]

      const [project] = (await dataSource.query(
        `INSERT INTO project.projects
           (org_id, name, color, key_prefix, created_by, updated_by,
            deleted_at, deleted_by)
         VALUES ($1, 'p', 'gray', 'PRJ', $2, $2, ${daysAgo(age)}, $2)
         RETURNING id`,
        [org.id, SYSTEM_USER_ID],
      )) as { id: string }[]

      const [status] = (await dataSource.query(
        `INSERT INTO project.statuses
           (org_id, project_id, name, color, sort_order,
            created_by, updated_by, deleted_at, deleted_by)
         VALUES ($1, $2, 'todo', '#fff', 'a0', $3, $3, ${daysAgo(age)}, $3)
         RETURNING id`,
        [org.id, project.id, SYSTEM_USER_ID],
      )) as { id: string }[]

      await dataSource.query(
        `INSERT INTO task.tasks
           (org_id, project_id, title, number, status_id, sort_order,
            created_by, updated_by, deleted_at, deleted_by)
         VALUES ($1, $2, 't', 1, $3, 'a0', $4, $4, ${daysAgo(age)}, $4)`,
        [org.id, project.id, status.id, SYSTEM_USER_ID],
      )
    }

    const countRows = async (table: string): Promise<number> => {
      const [row] = (await dataSource.query(
        `SELECT count(*)::int AS count FROM ${table}`,
      )) as { count: number }[]
      return row.count
    }

    it('hard-deletes a whole tree once it is past the window', async () => {
      await seedDeletedTree('old', 100)

      const deleted = await retention.purgeSoftDeleted()

      // The order matters here and nothing else enforces it: tasks.project_id
      // and tasks.status_id are RESTRICT, so a sweep that started at the org
      // would fail rather than cascade.
      expect(deleted).toBe(4)
      expect(await countRows('task.tasks')).toBe(0)
      expect(await countRows('project.statuses')).toBe(0)
      expect(await countRows('project.projects')).toBe(0)
      expect(await countRows('organization.organizations')).toBe(0)
    })

    it('leaves rows still inside the window alone', async () => {
      await seedDeletedTree('recent', 10)

      expect(await retention.purgeSoftDeleted()).toBe(0)
      expect(await countRows('task.tasks')).toBe(1)
    })

    it('steps over a table it cannot purge and keeps going', async () => {
      // An organisation with nothing left in it: purgeable.
      await dataSource.query(
        `INSERT INTO organization.organizations
           (name, slug, created_by, updated_by, deleted_at, deleted_by)
         VALUES ('empty', 'empty', $1, $1, ${daysAgo(100)}, $1)`,
        [SYSTEM_USER_ID],
      )

      // A project deleted long ago whose task was somehow never deleted with
      // it. tasks.project_id is RESTRICT, so this project cannot be removed.
      const [org] = (await dataSource.query(
        `INSERT INTO organization.organizations (name, slug, created_by, updated_by)
         VALUES ('stuck', 'stuck', $1, $1) RETURNING id`,
        [SYSTEM_USER_ID],
      )) as { id: string }[]
      const [project] = (await dataSource.query(
        `INSERT INTO project.projects
           (org_id, name, color, key_prefix, created_by, updated_by,
            deleted_at, deleted_by)
         VALUES ($1, 'p', 'gray', 'PRJ', $2, $2, ${daysAgo(100)}, $2)
         RETURNING id`,
        [org.id, SYSTEM_USER_ID],
      )) as { id: string }[]
      const [status] = (await dataSource.query(
        `INSERT INTO project.statuses
           (org_id, project_id, name, color, sort_order, created_by, updated_by)
         VALUES ($1, $2, 'todo', '#fff', 'a0', $3, $3) RETURNING id`,
        [org.id, project.id, SYSTEM_USER_ID],
      )) as { id: string }[]
      await dataSource.query(
        `INSERT INTO task.tasks
           (org_id, project_id, title, number, status_id, sort_order,
            created_by, updated_by)
         VALUES ($1, $2, 't', 1, $3, 'a0', $4, $4)`,
        [org.id, project.id, status.id, SYSTEM_USER_ID],
      )

      // Resolves rather than throwing, and the empty org is still collected.
      await expect(retention.purgeSoftDeleted()).resolves.toBe(1)
      expect(await countRows('project.projects')).toBe(1)
    })

    it('leaves live rows alone', async () => {
      const [org] = (await dataSource.query(
        `INSERT INTO organization.organizations (name, slug, created_by, updated_by)
         VALUES ('live', 'live', $1, $1) RETURNING id`,
        [SYSTEM_USER_ID],
      )) as { id: string }[]

      await retention.purgeSoftDeleted()

      expect(await countRows('organization.organizations')).toBe(1)
      expect(org.id).toBeTruthy()
    })
  })

  describe('users who asked to be deleted', () => {
    /** `requestedDaysAgo` is ignored unless the status is pending_deletion. */
    const seedUser = async (
      email: string,
      status: string,
      requestedDaysAgo: number,
    ): Promise<string> => {
      const requestedAt =
        status === 'pending_deletion' ? daysAgo(requestedDaysAgo) : 'NULL'

      const [user] = (await dataSource.query(
        `INSERT INTO iam.users
           (email, name, nickname, status, deletion_requested_at,
            created_by, updated_by)
         VALUES ($1, 'Somchai', 'Som', $2, ${requestedAt}, $3, $3)
         RETURNING id`,
        [email, status, SYSTEM_USER_ID],
      )) as { id: string }[]
      return user.id
    }

    it('will not accept a pending_deletion row with no request date', async () => {
      // The retention job counts from that column, so a row without one would
      // sit in the grace period forever.
      await expect(
        dataSource.query(
          `INSERT INTO iam.users
             (email, name, nickname, status, created_by, updated_by)
           VALUES ('nodate@example.com', 'S', 'S', 'pending_deletion', $1, $1)`,
          [SYSTEM_USER_ID],
        ),
      ).rejects.toThrow(/users_deletion_requested_matches_status_check/)
    })

    it('will not leave the request date behind on a recovered account', async () => {
      const id = await seedUser('back@example.com', 'pending_deletion', 5)

      // Logging in during the window clears the status; the date has to go
      // with it, or the job would anonymise someone who came back.
      await expect(
        dataSource.query(
          `UPDATE iam.users SET status = 'active' WHERE id = $1`,
          [id],
        ),
      ).rejects.toThrow(/users_deletion_requested_matches_status_check/)
    })

    it('anonymises the row instead of deleting it', async () => {
      const id = await seedUser('gone@example.com', 'pending_deletion', 45)

      expect(await retention.anonymisePendingDeletionUsers()).toBe(1)

      const [user] = (await dataSource.query(
        `SELECT email::text, name, nickname, avatar_url, password_hash,
                status, deletion_requested_at, deleted_at, deleted_by, updated_by
           FROM iam.users WHERE id = $1`,
        [id],
      )) as Record<string, unknown>[]

      // The row survives so that everything this person created still has an
      // author — that is the whole reason created_by is RESTRICT.
      expect(user).toBeDefined()
      expect(user.email).not.toContain('gone@example.com')
      expect(user.name).toBe('Deleted user')
      expect(user.password_hash).toBeNull()
      expect(user.status).toBe('deleted')
      expect(user.deletion_requested_at).toBeNull()
      expect(user.deleted_at).not.toBeNull()
      // No request context out here, so the job names its actor itself.
      expect(user.deleted_by).toBe(SYSTEM_USER_ID)
      expect(user.updated_by).toBe(SYSTEM_USER_ID)
    })

    it('frees the email address for reuse', async () => {
      await seedUser('reused@example.com', 'pending_deletion', 45)
      await retention.anonymisePendingDeletionUsers()

      // users_email_unique is partial — WHERE status <> 'deleted' — so the
      // address stops being reserved at the moment it stops being stored.
      await expect(
        seedUser('reused@example.com', 'active', 0),
      ).resolves.toBeTruthy()
    })

    it('leaves someone still inside their grace period', async () => {
      const id = await seedUser('waiting@example.com', 'pending_deletion', 5)

      expect(await retention.anonymisePendingDeletionUsers()).toBe(0)

      const [user] = (await dataSource.query(
        `SELECT status FROM iam.users WHERE id = $1`,
        [id],
      )) as { status: string }[]
      expect(user.status).toBe('pending_deletion')
    })

    it('never touches the system user', async () => {
      await dataSource.query(
        `UPDATE iam.users
            SET status = 'pending_deletion',
                deletion_requested_at = ${daysAgo(400)}
          WHERE is_system`,
      )

      await retention.anonymisePendingDeletionUsers()

      const [user] = (await dataSource.query(
        `SELECT status, email::text FROM iam.users WHERE is_system`,
      )) as { status: string; email: string }[]
      expect(user.status).toBe('pending_deletion')
      expect(user.email).not.toContain('deleted.invalid')

      await dataSource.query(
        `UPDATE iam.users
            SET status = 'active', deletion_requested_at = NULL
          WHERE is_system`,
      )
    })
  })

  describe('tables with their own end-of-life column', () => {
    beforeEach(async () => {
      await dataSource.query(`DELETE FROM iam.sessions`)
      await dataSource.query(`DELETE FROM iam.password_reset_tokens`)
      await dataSource.query(`DELETE FROM notify.outbox`)
    })

    const seedSession = (expiresDaysAgo: number, revoked: boolean) =>
      dataSource.query(
        `INSERT INTO iam.sessions
           (user_id, current_token_hash, user_agent, ip_address,
            expires_at, revoked_at, created_by, updated_by)
         VALUES ($1, 'hash', 'vitest', '127.0.0.1',
                 ${daysAgo(expiresDaysAgo)},
                 ${revoked ? daysAgo(expiresDaysAgo) : 'NULL'}, $1, $1)`,
        [SYSTEM_USER_ID],
      )

    it('removes sessions a week past their expiry, revoked or not', async () => {
      await seedSession(30, false)
      await seedSession(30, true)
      await seedSession(1, false)

      expect(await retention.purgeFinishedSessions()).toBe(2)
    })

    it('keeps a session that has not expired', async () => {
      await dataSource.query(
        `INSERT INTO iam.sessions
           (user_id, current_token_hash, user_agent, ip_address,
            expires_at, created_by, updated_by)
         VALUES ($1, 'hash', 'vitest', '127.0.0.1',
                 now() + interval '15 days', $1, $1)`,
        [SYSTEM_USER_ID],
      )

      expect(await retention.purgeFinishedSessions()).toBe(0)
    })

    it('removes password reset tokens after a day', async () => {
      await dataSource.query(
        `INSERT INTO iam.password_reset_tokens
           (user_id, token_hash, expires_at, created_at, created_by, updated_by)
         VALUES ($1, 'h', now(), ${daysAgo(3)}, $1, $1),
                ($1, 'h', now(), now(), $1, $1)`,
        [SYSTEM_USER_ID],
      )

      expect(await retention.purgePasswordResetTokens()).toBe(1)
    })

    it('removes notifications a month after they were sent', async () => {
      const [org] = (await dataSource.query(
        `INSERT INTO organization.organizations (name, slug, created_by, updated_by)
         VALUES ('notify', 'notify-org', $1, $1) RETURNING id`,
        [SYSTEM_USER_ID],
      )) as { id: string }[]

      await dataSource.query(
        `INSERT INTO notify.outbox
           (org_id, recipient_id, channel, template, status, sent_at,
            created_by, updated_by)
         VALUES ($1, $2, 'email', 't', 'sent', ${daysAgo(40)}, $2, $2),
                ($1, $2, 'email', 't', 'sent', ${daysAgo(2)},  $2, $2),
                ($1, $2, 'email', 't', 'pending', NULL,        $2, $2)`,
        [org.id, SYSTEM_USER_ID],
      )

      // A pending row has no sent_at and is not the retention job's business,
      // however old it is — that one belongs to the worker.
      expect(await retention.purgeSentOutbox()).toBe(1)

      await dataSource.query(`DELETE FROM notify.outbox`)
      await dataSource.query(
        `DELETE FROM organization.organizations WHERE id = $1`,
        [org.id],
      )
    })
  })

  describe('audit log partitions', () => {
    it('is a no-op when the migration already created a year of them', async () => {
      expect(await auditPartitions.ensureUpcomingPartitions()).toEqual([])
    })

    it('recreates a partition that has gone missing', async () => {
      const month = new Date()
      month.setUTCMonth(month.getUTCMonth() + 6)
      const name = `logs_${month.getUTCFullYear()}_${String(
        month.getUTCMonth() + 1,
      ).padStart(2, '0')}`

      await dataSource.query(`DROP TABLE audit.${name}`)

      expect(await auditPartitions.ensureUpcomingPartitions()).toEqual([name])
    })

    it('reports rows stranded in the default partition', async () => {
      // Far enough out that no real partition covers it, which is exactly the
      // situation the default partition exists to absorb.
      await dataSource.query(
        `INSERT INTO audit.logs
           (org_id, entity_type, entity_id, actor_id, action, occurred_at)
         VALUES (gen_random_uuid(), 'task', gen_random_uuid(), $1, 'created',
                 now() + interval '20 years')`,
        [SYSTEM_USER_ID],
      )

      expect(await auditPartitions.reportDefaultPartitionRows()).toBe(1)

      await dataSource.query(`DELETE FROM audit.logs_default`)
      expect(await auditPartitions.reportDefaultPartitionRows()).toBe(0)
    })
  })

  it('runs every policy in one pass', async () => {
    // Nothing to assert about counts — the point is that run() gets through
    // all five steps under the lock without throwing.
    await expect(retention.run()).resolves.toBeUndefined()
  })

  describe('running in more than one process', () => {
    it('lets only one holder in at a time', async () => {
      let inner: { ran: boolean } = { ran: true }

      const outer = await withAdvisoryLock(
        dataSource,
        LOCK_KEYS.retention,
        async () => {
          // A second container firing the same cron on the same second.
          inner = await withAdvisoryLock(
            dataSource,
            LOCK_KEYS.retention,
            async () => 'should not run',
          )
          return 'ran'
        },
      )

      expect(outer).toEqual({ ran: true, result: 'ran' })
      expect(inner.ran).toBe(false)
    })

    it('releases the lock afterwards, including when the work throws', async () => {
      await expect(
        withAdvisoryLock(dataSource, LOCK_KEYS.retention, async () => {
          throw new Error('boom')
        }),
      ).rejects.toThrow('boom')

      const after = await withAdvisoryLock(
        dataSource,
        LOCK_KEYS.retention,
        async () => 'free',
      )
      expect(after).toEqual({ ran: true, result: 'free' })
    })
  })
})
