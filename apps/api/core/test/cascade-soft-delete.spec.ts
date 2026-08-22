import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { RetentionService } from '../src/maintenance/retention.service'
import { Project } from '../src/modules/project/project.entity'
import {
  AGGREGATE_CHILDREN,
  CascadeSoftDelete,
  ROOTS,
} from '../src/shared/cascade-soft-delete'
import { OrgScopedRepository } from '../src/shared/org-scoped.repository'
import { runWithRequestContext } from '../src/shared/request-context'
import { SYSTEM_USER_ID } from '../src/shared/system-user'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

/**
 * `ON DELETE CASCADE` only fires on a hard delete, so soft delete has to carry
 * an aggregate down itself. Getting it wrong is quiet in both directions: too
 * little and a deleted project keeps its tasks, too much and something that
 * should have survived disappears.
 */
describe.skipIf(!hasTestDatabase)('cascade soft delete', () => {
  let dataSource: DataSource
  let cascade: CascadeSoftDelete
  let orgA: string
  let orgB: string

  const asOrg = <R>(orgId: string, fn: () => R): R =>
    runWithRequestContext({ orgId, userId: SYSTEM_USER_ID }, fn)

  const newOrg = async (slug: string): Promise<string> => {
    const [org] = (await dataSource.query(
      `INSERT INTO organization.organizations (name, slug, created_by, updated_by)
       VALUES ($1, $1, $2, $2) RETURNING id`,
      [slug, SYSTEM_USER_ID],
    )) as { id: string }[]
    return org.id
  }

  const live = async (table: string): Promise<number> => {
    const [row] = (await dataSource.query(
      `SELECT count(*)::int AS count FROM ${table} WHERE deleted_at IS NULL`,
    )) as { count: number }[]
    return row.count
  }

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()
    cascade = new CascadeSoftDelete(dataSource)
  }, 60_000)

  afterAll(async () => {
    await dataSource?.destroy()
  })

  describe('the map of what belongs to what', () => {
    it('accounts for every soft-deletable table', async () => {
      const tables = (await dataSource.query(
        `SELECT n.nspname || '.' || c.relname AS name
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN pg_attribute a ON a.attrelid = c.oid
                              AND a.attname = 'deleted_at'
                              AND NOT a.attisdropped
          WHERE c.relkind = 'r'
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')`,
      )) as { name: string }[]

      const children = new Set(
        Object.values(AGGREGATE_CHILDREN).flatMap((links) =>
          links.map((link) => link.table),
        ),
      )

      // A table in neither list is one whose rows outlive whatever they
      // belonged to — which nothing else would ever report.
      const unaccounted = tables
        .map((row) => row.name)
        .filter((name) => !children.has(name) && !ROOTS.includes(name))

      expect(unaccounted).toEqual([])
    })

    it('names only columns that exist', async () => {
      const links = Object.values(AGGREGATE_CHILDREN).flat()

      for (const link of links) {
        const [schema, table] = link.table.split('.')
        const [column] = (await dataSource.query(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
          [schema, table, link.column],
        )) as { column_name: string }[]

        expect(column?.column_name, `${link.table}.${link.column}`).toBe(
          link.column,
        )
      }
    })
  })

  describe('what TypeORM hides on its own', () => {
    it('filters the query builder too, not only find()', async () => {
      const orgId = await newOrg('filters')
      const projects = new OrgScopedRepository(
        dataSource.getRepository(Project),
      )

      await asOrg(orgId, async () => {
        const project = await projects.save(projects.create({ name: 'gone' }))
        expect(await projects.softDeleteById(project.id)).toBe(1)

        // Worth asserting rather than assuming: the usual warning is that the
        // query builder skips the soft-delete filter. In TypeORM 1.1 it does
        // not, and code written around the warning would double-filter.
        expect(projects.queryBuilder.withOrg('project').getQuery()).toContain(
          '"project"."deleted_at" IS NULL',
        )
        expect(await projects.queryBuilder.withOrg('project').getCount()).toBe(
          0,
        )
        expect(await projects.count()).toBe(0)
        expect(await projects.exists()).toBe(false)

        // withDeleted() is the way back in, and raw SQL never left.
        expect(
          await projects.queryBuilder
            .withOrg('project')
            .withDeleted()
            .getCount(),
        ).toBe(1)

        expect(await live('project.projects')).toBe(0)
        const [all] = (await dataSource.query(
          `SELECT count(*)::int AS count FROM project.projects WHERE org_id = $1`,
          [orgId],
        )) as { count: number }[]
        expect(all.count).toBe(1)

        // A second delete finds nothing: update() gets no filter of its own,
        // so re-stamping would rewrite who deleted it and when.
        expect(await projects.softDeleteById(project.id)).toBe(0)
      })

      await dataSource.query(`DELETE FROM project.projects WHERE org_id = $1`, [
        orgId,
      ])
      await dataSource.query(
        `DELETE FROM organization.organizations WHERE id = $1`,
        [orgId],
      )
    })
  })

  describe('deleting a project', () => {
    let projectId: string
    let taskId: string

    beforeEach(async () => {
      await dataSource.query(`DELETE FROM discussion.comments`)
      await dataSource.query(`DELETE FROM view.columns`)
      await dataSource.query(`DELETE FROM view.views`)
      await dataSource.query(`DELETE FROM task.assignees`)
      await dataSource.query(`DELETE FROM task.tasks`)
      await dataSource.query(`DELETE FROM project.statuses`)
      await dataSource.query(`DELETE FROM project.members`)
      await dataSource.query(`DELETE FROM project.sprints`)
      await dataSource.query(`DELETE FROM project.projects`)
      await dataSource.query(`DELETE FROM organization.organizations`)

      orgA = await newOrg('cascade-a')
      orgB = await newOrg('cascade-b')

      const [project] = (await dataSource.query(
        `INSERT INTO project.projects (org_id, name, created_by, updated_by)
         VALUES ($1, 'p', $2, $2) RETURNING id`,
        [orgA, SYSTEM_USER_ID],
      )) as { id: string }[]
      projectId = project.id

      const [status] = (await dataSource.query(
        `INSERT INTO project.statuses
           (org_id, project_id, name, color, sort_order, created_by, updated_by)
         VALUES ($1, $2, 'todo', 'gray', 'a0', $3, $3) RETURNING id`,
        [orgA, projectId, SYSTEM_USER_ID],
      )) as { id: string }[]

      await dataSource.query(
        `INSERT INTO project.members
           (org_id, project_id, user_id, role, created_by, updated_by)
         VALUES ($1, $2, $3, 'member', $3, $3)`,
        [orgA, projectId, SYSTEM_USER_ID],
      )

      const [task] = (await dataSource.query(
        `INSERT INTO task.tasks
           (org_id, project_id, title, status_id, sort_order, created_by, updated_by)
         VALUES ($1, $2, 'parent', $3, 'a0', $4, $4) RETURNING id`,
        [orgA, projectId, status.id, SYSTEM_USER_ID],
      )) as { id: string }[]
      taskId = task.id

      await dataSource.query(
        `INSERT INTO task.tasks
           (org_id, project_id, title, status_id, sort_order, depth,
            parent_task_id, created_by, updated_by)
         VALUES ($1, $2, 'sub', $3, 'a1', 1, $4, $5, $5)`,
        [orgA, projectId, status.id, taskId, SYSTEM_USER_ID],
      )

      await dataSource.query(
        `INSERT INTO task.assignees
           (org_id, task_id, assignee_type, assignee_id, created_by)
         VALUES ($1, $2, 'user', $3, $3)`,
        [orgA, taskId, SYSTEM_USER_ID],
      )

      const [view] = (await dataSource.query(
        `INSERT INTO view.views
           (org_id, project_id, name, type, owner_id, created_by, updated_by)
         VALUES ($1, $2, 'board', 'board', $3, $3, $3) RETURNING id`,
        [orgA, projectId, SYSTEM_USER_ID],
      )) as { id: string }[]

      await dataSource.query(
        `INSERT INTO view.columns
           (org_id, view_id, column_type, column_key, sort_order, created_by, updated_by)
         VALUES ($1, $2, 'field', 'title', 'a0', $3, $3)`,
        [orgA, view.id, SYSTEM_USER_ID],
      )
    })

    it('takes everything belonging to it, down every level', async () => {
      const deleted = await asOrg(orgA, () =>
        cascade.softDelete('project.projects', projectId),
      )

      expect(deleted).toEqual({
        'project.projects': 1,
        'project.statuses': 1,
        // The parent task and its sub-task, found on two passes.
        'task.tasks': 2,
        'view.views': 1,
        'view.columns': 1,
      })

      expect(await live('task.tasks')).toBe(0)
      expect(await live('view.columns')).toBe(0)
      expect(await live('project.statuses')).toBe(0)
    })

    it('leaves membership rows alone, so a restore comes back whole', async () => {
      // project.members and task.assignees are hard-delete now: removing
      // someone is a relationship change, and the activity log is what records
      // that it happened. Cascading into them would mean a restored project
      // came back with nobody in it, and a soft-deleted membership row is an
      // access-control bug waiting for one query that forgets the filter.
      await asOrg(orgA, () => cascade.softDelete('project.projects', projectId))

      const [members] = (await dataSource.query(
        `SELECT count(*)::int AS count FROM project.members WHERE project_id = $1`,
        [projectId],
      )) as { count: number }[]
      const [assignees] = (await dataSource.query(
        `SELECT count(*)::int AS count FROM task.assignees WHERE task_id = $1`,
        [taskId],
      )) as { count: number }[]

      expect(members!.count).toBe(1)
      expect(assignees!.count).toBe(1)
    })

    it('takes the comments and files attached to a task with it', async () => {
      await dataSource.query(
        `INSERT INTO discussion.comments
           (org_id, entity_type, entity_id, body, created_by, updated_by)
         VALUES ($1, 'task', $2, 'on the task', $3, $3),
                ($1, 'project', $4, 'on the project', $3, $3)`,
        [orgA, taskId, SYSTEM_USER_ID, projectId],
      )

      const deleted = await asOrg(orgA, () =>
        cascade.softDelete('task.tasks', taskId),
      )

      // Polymorphic, so entity_type has to be part of the match — without it
      // this would take the comment on the project too.
      expect(deleted['discussion.comments']).toBe(1)
      expect(await live('discussion.comments')).toBe(1)
    })

    it('refuses an id belonging to another organisation', async () => {
      const deleted = await asOrg(orgB, () =>
        cascade.softDelete('project.projects', projectId),
      )

      expect(deleted).toEqual({})
      expect(await live('project.projects')).toBe(1)
      expect(await live('task.tasks')).toBe(2)
    })

    it('leaves a row that was already deleted as it was', async () => {
      await dataSource.query(
        `UPDATE project.statuses
            SET deleted_at = now() - interval '5 days', deleted_by = $1
          WHERE project_id = $2`,
        [SYSTEM_USER_ID, projectId],
      )

      const before = (await dataSource.query(
        `SELECT deleted_at FROM project.statuses WHERE project_id = $1`,
        [projectId],
      )) as { deleted_at: Date }[]

      const deleted = await asOrg(orgA, () =>
        cascade.softDelete('project.projects', projectId),
      )

      const after = (await dataSource.query(
        `SELECT deleted_at FROM project.statuses WHERE project_id = $1`,
        [projectId],
      )) as { deleted_at: Date }[]

      // Re-stamping would restart its ninety-day retention clock and lose who
      // actually deleted it.
      expect(deleted['project.statuses']).toBeUndefined()
      expect(after[0]!.deleted_at).toEqual(before[0]!.deleted_at)
    })

    it('does nothing on a second pass', async () => {
      await asOrg(orgA, () => cascade.softDelete('project.projects', projectId))

      expect(
        await asOrg(orgA, () =>
          cascade.softDelete('project.projects', projectId),
        ),
      ).toEqual({})
    })

    it('leaves a tree that retention can then purge', async () => {
      await asOrg(orgA, () => cascade.softDelete('project.projects', projectId))

      // The point of the whole exercise: tasks.project_id is RESTRICT, so a
      // project whose tasks were left behind can never be hard-deleted.
      await dataSource.query(
        `UPDATE project.projects SET deleted_at = now() - interval '100 days'
          WHERE deleted_at IS NOT NULL`,
      )
      await dataSource.query(
        `UPDATE task.tasks SET deleted_at = now() - interval '100 days'
          WHERE deleted_at IS NOT NULL`,
      )

      const retention = new RetentionService(dataSource)

      await retention.purgeSoftDeleted()

      const [row] = (await dataSource.query(
        `SELECT count(*)::int AS count FROM project.projects`,
      )) as { count: number }[]
      expect(row.count).toBe(0)
    })
  })
})
