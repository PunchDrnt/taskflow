import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createOrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { runWithRequestContext } from '#shared/org-scope/request-context'
import { SYSTEM_USER_ID } from '#shared/system-user'

import { AuditService } from '../src/modules/audit/audit.service'
import { changesBetween } from '../src/modules/audit/changes'
import { AuditLog } from '../src/modules/audit/log.entity'
import { Project } from '../src/modules/project/project.entity'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

/**
 * 🔒 The activity log is written in the transaction it describes. History
 * cannot be reconstructed, so the failure this guards against — the business
 * write commits and the log entry quietly does not — has no recovery.
 */
describe.skipIf(!hasTestDatabase)('activity log', () => {
  let dataSource: DataSource
  let audit: AuditService
  let orgId: string
  let otherOrg: string

  const asOrg = <R>(org: string, fn: () => R): R =>
    runWithRequestContext(
      { orgId: org, userId: SYSTEM_USER_ID, sessionId: null },
      fn,
    )

  const newOrg = async (slug: string): Promise<string> => {
    const [org] = (await dataSource.query(
      `INSERT INTO organization.organizations (name, slug, created_by, updated_by)
       VALUES ($1, $1, $2, $2) RETURNING id`,
      [slug, SYSTEM_USER_ID],
    )) as { id: string }[]
    return org.id
  }

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()
    audit = new AuditService(createOrgScopedRepository(dataSource, AuditLog))
    orgId = await newOrg('audit-a')
    otherOrg = await newOrg('audit-b')
  }, 60_000)

  afterAll(async () => {
    await dataSource?.destroy()
  })

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM audit.logs`)
  })

  describe('writing', () => {
    it('refuses a manager that is not in a transaction', async () => {
      await expect(
        asOrg(orgId, () =>
          audit.record(dataSource.manager, {
            entityType: 'task',
            entityId: SYSTEM_USER_ID,
            action: 'created',
          }),
        ),
      ).rejects.toThrow(/open transaction/)
    })

    it('rolls back with the change it describes', async () => {
      const projects = createOrgScopedRepository(dataSource, Project)

      await expect(
        asOrg(orgId, () =>
          dataSource.transaction(async (manager) => {
            const project = await manager.save(
              manager.create(Project, {
                orgId,
                name: 'doomed',
                color: 'gray',
                keyPrefix: 'PRJ',
                createdBy: SYSTEM_USER_ID,
                updatedBy: SYSTEM_USER_ID,
              }),
            )

            await audit.record(manager, {
              entityType: 'project',
              entityId: project.id,
              action: 'created',
            })

            throw new Error('business rule failed after both writes')
          }),
        ),
      ).rejects.toThrow('business rule failed')

      // Neither survives. An event-emitted log would have written this one
      // after the commit that never happened — or worse, after one that did.
      const [logs] = (await dataSource.query(
        `SELECT count(*)::int AS count FROM audit.logs`,
      )) as { count: number }[]
      expect(logs.count).toBe(0)
      expect(await asOrg(orgId, () => projects.count())).toBe(0)
    })

    it('takes the org and the actor from the context, not the caller', async () => {
      await asOrg(orgId, () =>
        dataSource.transaction((manager) =>
          audit.record(manager, {
            entityType: 'task',
            entityId: '11111111-1111-1111-1111-111111111111',
            action: 'created',
          }),
        ),
      )

      const [row] = (await dataSource.query(
        `SELECT org_id, actor_id, changes_json FROM audit.logs`,
      )) as { org_id: string; actor_id: string; changes_json: unknown }[]

      expect(row.org_id).toBe(orgId)
      expect(row.actor_id).toBe(SYSTEM_USER_ID)
      expect(row.changes_json).toEqual({})
    })
  })

  describe('reading', () => {
    const taskId = '22222222-2222-2222-2222-222222222222'

    const write = (org: string, action: string, entityId = taskId) =>
      asOrg(org, () =>
        dataSource.transaction((manager) =>
          audit.record(manager, { entityType: 'task', entityId, action }),
        ),
      )

    it('returns one entity history, newest first', async () => {
      await write(orgId, 'created')
      await write(orgId, 'updated')

      const history = await asOrg(orgId, () =>
        audit.findForEntity('task', taskId),
      )

      expect(history.map((entry) => entry.action)).toEqual([
        'updated',
        'created',
      ])
    })

    it('cannot see another organisation’s history', async () => {
      await write(otherOrg, 'created')

      expect(
        await asOrg(orgId, () => audit.findForEntity('task', taskId)),
      ).toEqual([])
    })

    it('lists what an actor recently acted on, each id once', async () => {
      const other = '33333333-3333-3333-3333-333333333333'
      await write(orgId, 'assigned')
      await write(orgId, 'assigned')
      await write(orgId, 'assigned', other)
      await write(orgId, 'created', '44444444-4444-4444-4444-444444444444')

      const targets = await asOrg(orgId, () =>
        audit.findRecentTargets(SYSTEM_USER_ID, 'assigned'),
      )

      // Grouped, so a task touched twice does not fill the list, and the
      // 'created' entry is a different action entirely.
      expect(targets).toHaveLength(2)
      expect(new Set(targets)).toEqual(new Set([taskId, other]))
    })
  })

  describe('what changed', () => {
    it('records only the fields that moved', () => {
      expect(
        changesBetween(
          { name: 'old', priority: 'high', updatedBy: 'a' },
          { name: 'new', priority: 'high', updatedBy: 'b' },
        ),
      ).toEqual({ name: { from: 'old', to: 'new' } })
    })

    it('compares dates and json by value, not by reference', () => {
      const before = { due: new Date('2026-01-01'), tags: { a: 1 } }
      const after = { due: new Date('2026-01-01'), tags: { a: 1 } }

      // Both are fresh objects every time a row is loaded, so comparing them
      // by identity would report a change on every save.
      expect(changesBetween(before, after)).toEqual({})
    })

    it('serialises dates, since the column is jsonb', () => {
      expect(
        changesBetween({ due: null }, { due: new Date('2026-01-01') }),
      ).toEqual({ due: { from: null, to: '2026-01-01T00:00:00.000Z' } })
    })
  })
})
