import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { OrgRole } from '@repo/shared'

import { CascadeSoftDelete } from '#shared/entity/cascade-soft-delete'
import { ApiException } from '#shared/http/api-exception'
import { createOrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { runWithRequestContext } from '#shared/org-scope/request-context'
import { SYSTEM_USER_ID } from '#shared/system-user'

import { AuditService } from '../src/modules/audit/audit.service'
import { AuditLog } from '../src/modules/audit/log.entity'
import { Project } from '../src/modules/project/project.entity'
import { ProjectService } from '../src/modules/project/project.service'
import { Status } from '../src/modules/project/status.entity'
import { StatusService } from '../src/modules/project/status.service'
import { Task } from '../src/modules/task/task.entity'
import { TasksInStatusService } from '../src/modules/task/tasks-in-status.service'
import { PermissionService } from '../src/permission/permission.service'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

/**
 * The statuses of a project, and the four rules holding the table together —
 * none of which a database constraint can express, because each is about a set
 * of rows rather than one.
 *
 * Two of them are the 🔒 invariant `.claude/checklists/phase-1.md` §0 has been
 * carrying since Phase 0: a project always has a status, and always has one
 * that counts as finished. Without the second, nothing in the project can ever
 * be completed and every progress figure reads zero permanently.
 */
describe.skipIf(!hasTestDatabase)('project statuses', () => {
  let dataSource: DataSource
  let projects: ProjectService
  let statuses: StatusService
  let acme: string
  let owner: string
  let plain: string
  let apollo: string

  const as = <R>(
    orgId: string | null,
    userId: string,
    orgRole: OrgRole | null,
    fn: () => R,
  ): R => runWithRequestContext({ orgId, userId, orgRole, sessionId: null }, fn)

  const asOwner = <R>(fn: () => R): R => as(acme, owner, 'owner', fn)

  const newUser = async (name: string): Promise<string> => {
    const [user] = (await dataSource.query(
      `INSERT INTO iam.users
         (email, username, password_hash, name, nickname, status, created_by,
          updated_by)
       VALUES ($1, $2, 'x', $3, $3, 'active', $4, $4) RETURNING id`,
      [`${name}@example.com`, name, name, SYSTEM_USER_ID],
    )) as { id: string }[]

    return user.id
  }

  const codeOf = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise
      return 'did not throw'
    } catch (error) {
      return error instanceof ApiException ? error.code : String(error)
    }
  }

  const named = async (name: string): Promise<string> =>
    (await asOwner(() => statuses.list(apollo))).find(
      (one) => one.name === name,
    )!.id

  /** A task sitting in one status, which is what makes the rules bite. */
  const newTask = async (statusId: string, number: number): Promise<string> => {
    const [task] = (await dataSource.query(
      `INSERT INTO task.tasks
         (org_id, project_id, title, status_id, number, sort_order, depth,
          created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, 'a0', 0, $6, $6) RETURNING id`,
      [acme, apollo, `Task ${number}`, statusId, number, owner],
    )) as { id: string }[]

    return task.id
  }

  const completionOf = async (
    taskId: string,
  ): Promise<{ at: Date | null; by: string | null }> => {
    const [row] = (await dataSource.query(
      `SELECT completed_at, completed_by FROM task.tasks WHERE id = $1`,
      [taskId],
    )) as { completed_at: Date | null; completed_by: string | null }[]

    return { at: row!.completed_at, by: row!.completed_by }
  }

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()

    const permissions = new PermissionService()
    const audit = new AuditService(
      createOrgScopedRepository(dataSource, AuditLog),
    )

    projects = new ProjectService(
      createOrgScopedRepository(dataSource, Project),
      dataSource,
      permissions,
      audit,
      new CascadeSoftDelete(dataSource),
    )
    statuses = new StatusService(
      createOrgScopedRepository(dataSource, Status),
      dataSource,
      projects,
      new TasksInStatusService(createOrgScopedRepository(dataSource, Task)),
      audit,
    )

    owner = await newUser('s_owner')
    plain = await newUser('s_plain')
  }, 60_000)

  afterAll(async () => {
    await dataSource?.destroy()
  })

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM task.tasks`)
    await dataSource.query(`DELETE FROM audit.logs`)
    await dataSource.query(`DELETE FROM project.projects`)
    await dataSource.query(`DELETE FROM organization.members`)
    await dataSource.query(`DELETE FROM organization.organizations`)

    const [org] = (await dataSource.query(
      `INSERT INTO organization.organizations (name, slug, created_by, updated_by)
       VALUES ('Acme', 'acme', $1, $1) RETURNING id`,
      [SYSTEM_USER_ID],
    )) as { id: string }[]

    acme = org.id

    for (const [userId, role] of [
      [owner, 'owner'],
      [plain, 'member'],
    ] as [string, OrgRole][]) {
      await dataSource.query(
        `INSERT INTO organization.members
           (org_id, user_id, role, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $4)`,
        [acme, userId, role, SYSTEM_USER_ID],
      )
    }

    apollo = (
      await asOwner(() =>
        projects.create({ name: 'Apollo', keyPrefix: 'APL', color: 'blue' }),
      )
    ).id
  })

  describe('the starting set', () => {
    it('is four, in board order, with one of each kind', async () => {
      expect(await asOwner(() => statuses.list(apollo))).toMatchObject([
        { name: 'To do', kind: 'normal', isDefault: true },
        { name: 'In progress', kind: 'normal', isDefault: false },
        { name: 'Done', kind: 'done', isDefault: false },
        { name: 'Cancelled', kind: 'cancelled', isDefault: false },
      ])
    })
  })

  describe('adding', () => {
    it('puts a new status at the end, never in the middle', async () => {
      // Nobody asked for a position, and inventing one moves work that is
      // already sorted.
      await asOwner(() =>
        statuses.create(apollo, {
          name: 'Blocked',
          color: 'red',
          kind: 'normal',
        }),
      )

      const names = (await asOwner(() => statuses.list(apollo))).map(
        (one) => one.name,
      )

      expect(names).toEqual([
        'To do',
        'In progress',
        'Done',
        'Cancelled',
        'Blocked',
      ])
    })

    it('refuses a name the project already uses', async () => {
      expect(
        await codeOf(
          asOwner(() =>
            statuses.create(apollo, {
              name: 'Done',
              color: 'red',
              kind: 'normal',
            }),
          ),
        ),
      ).toBe('STATUS_NAME_TAKEN')
    })
  })

  describe('🔒 the project always keeps one that counts as finished', () => {
    it('refuses to re-type the last done status', async () => {
      // Without one, nothing in the project can ever be completed — and every
      // progress figure reads zero forever, with no error anywhere.
      const done = await named('Done')

      expect(
        await codeOf(
          asOwner(() => statuses.update(apollo, done, { kind: 'normal' })),
        ),
      ).toBe('LAST_DONE_STATUS')
    })

    it('refuses to delete the last done status', async () => {
      const done = await named('Done')

      expect(await codeOf(asOwner(() => statuses.remove(apollo, done)))).toBe(
        'LAST_DONE_STATUS',
      )
    })

    it('allows both once a second one exists', async () => {
      await asOwner(() =>
        statuses.create(apollo, {
          name: 'Shipped',
          color: 'green',
          kind: 'done',
        }),
      )

      const done = await named('Done')

      await expect(
        asOwner(() => statuses.remove(apollo, done)),
      ).resolves.toBeUndefined()
    })
  })

  describe('🔒 the project always keeps at least one status', () => {
    it('refuses to delete the last one', async () => {
      // Reached by emptying the board: each delete is legal until the one that
      // would leave nothing.
      const inProgress = await named('In progress')
      const cancelled = await named('Cancelled')
      const done = await named('Done')
      const todo = await named('To do')

      await asOwner(() => statuses.remove(apollo, inProgress))
      await asOwner(() => statuses.remove(apollo, cancelled))

      // 'To do' is the default and 'Done' is the only done status, so both are
      // refused for their own reasons before the count ever matters.
      expect(await codeOf(asOwner(() => statuses.remove(apollo, done)))).toBe(
        'LAST_DONE_STATUS',
      )
      expect(await codeOf(asOwner(() => statuses.remove(apollo, todo)))).toBe(
        'LAST_DEFAULT_STATUS',
      )

      expect(await asOwner(() => statuses.list(apollo))).toHaveLength(2)
    })
  })

  describe('the default', () => {
    it('moves, leaving exactly one', async () => {
      const inProgress = await named('In progress')

      await asOwner(() =>
        statuses.update(apollo, inProgress, { isDefault: true }),
      )

      const listed = await asOwner(() => statuses.list(apollo))

      expect(listed.filter((one) => one.isDefault)).toMatchObject([
        { name: 'In progress' },
      ])
    })

    it('cannot be deleted while it is the default', async () => {
      // Not in the original specification, which named only "the last one" and
      // "one still in use". The gap it leaves is a project where the next
      // quick-add has nowhere to file the task.
      const todo = await named('To do')

      expect(await codeOf(asOwner(() => statuses.remove(apollo, todo)))).toBe(
        'LAST_DEFAULT_STATUS',
      )
    })

    it('can be deleted once the flag has moved', async () => {
      const todo = await named('To do')
      const inProgress = await named('In progress')

      await asOwner(() =>
        statuses.update(apollo, inProgress, { isDefault: true }),
      )

      await expect(
        asOwner(() => statuses.remove(apollo, todo)),
      ).resolves.toBeUndefined()
    })

    it('🔒 survives two requests moving it at once', async () => {
      // Both transactions clear the old default before setting their own, so
      // they serialise on that row and either order leaves exactly one. What
      // this pins is the outcome, not the mechanism — the partial unique index
      // on `(project_id) WHERE is_default` is the backstop underneath.
      const inProgress = await named('In progress')
      const cancelled = await named('Cancelled')

      await Promise.allSettled([
        asOwner(() => statuses.update(apollo, inProgress, { isDefault: true })),
        asOwner(() => statuses.update(apollo, cancelled, { isDefault: true })),
      ])

      const listed = await asOwner(() => statuses.list(apollo))

      expect(listed.filter((one) => one.isDefault)).toHaveLength(1)
    })
  })

  describe('a status holding work', () => {
    it('cannot be removed out from under its tasks', async () => {
      const inProgress = await named('In progress')
      await newTask(inProgress, 1)
      await newTask(inProgress, 2)

      const thrown = await asOwner(() => statuses.remove(apollo, inProgress))
        .then(() => null)
        .catch((error: unknown) => error as ApiException)

      expect(thrown?.code).toBe('STATUS_IN_USE')
      // The count is in the body so the settings screen can grey the button
      // out with the same number rather than only reporting the failure.
      expect(thrown?.details).toEqual({ tasks: 2 })
    })

    it('can be removed once the tasks have moved on', async () => {
      const inProgress = await named('In progress')
      const task = await newTask(inProgress, 1)

      await dataSource.query(
        `UPDATE task.tasks SET status_id = $1 WHERE id = $2`,
        [await named('To do'), task],
      )

      await expect(
        asOwner(() => statuses.remove(apollo, inProgress)),
      ).resolves.toBeUndefined()
    })

    it('does not count a deleted task', async () => {
      const inProgress = await named('In progress')
      const task = await newTask(inProgress, 1)

      await dataSource.query(
        `UPDATE task.tasks SET deleted_at = now(), deleted_by = $1 WHERE id = $2`,
        [owner, task],
      )

      await expect(
        asOwner(() => statuses.remove(apollo, inProgress)),
      ).resolves.toBeUndefined()
    })
  })

  describe('🔒 changing what a status counts as reaches the tasks in it', () => {
    it('stamps a completion on tasks when a status becomes done', async () => {
      // The direction that gets forgotten, because the person doing it is
      // looking at a settings screen and not at a single task. No CHECK can
      // catch it: the condition spans task.tasks and project.statuses.
      const inProgress = await named('In progress')
      const task = await newTask(inProgress, 1)

      expect(await completionOf(task)).toEqual({ at: null, by: null })

      await asOwner(() => statuses.update(apollo, inProgress, { kind: 'done' }))

      const after = await completionOf(task)

      expect(after.at).toBeInstanceOf(Date)
      // Credited to whoever caused it, which is the person who re-typed the
      // status. Both columns move together, as the CHECK requires.
      expect(after.by).toBe(owner)
    })

    it('takes it back off when the status stops being done', async () => {
      await asOwner(() =>
        statuses.create(apollo, {
          name: 'Shipped',
          color: 'green',
          kind: 'done',
        }),
      )

      const done = await named('Done')
      const task = await newTask(done, 1)

      await asOwner(() => statuses.update(apollo, done, { kind: 'normal' }))

      expect(await completionOf(task)).toEqual({ at: null, by: null })
    })

    it('leaves an already-completed task its original date', async () => {
      // Re-running must change nothing: only the rows that actually disagree
      // are touched, so a task keeps the moment it was finished.
      const inProgress = await named('In progress')
      const task = await newTask(inProgress, 1)

      await asOwner(() => statuses.update(apollo, inProgress, { kind: 'done' }))
      const first = await completionOf(task)

      await asOwner(() =>
        statuses.update(apollo, inProgress, { name: 'In progress ' }),
      )

      expect((await completionOf(task)).at).toEqual(first.at)
    })

    it('records how many tasks it touched', async () => {
      const inProgress = await named('In progress')
      await newTask(inProgress, 1)
      await newTask(inProgress, 2)

      await dataSource.query(`DELETE FROM audit.logs`)
      await asOwner(() => statuses.update(apollo, inProgress, { kind: 'done' }))

      const [entry] = (await dataSource.query(
        `SELECT changes_json FROM audit.logs WHERE entity_type = 'status'`,
      )) as { changes_json: Record<string, unknown> }[]

      expect(entry?.changes_json).toMatchObject({
        tasksReconciled: { to: 2 },
      })
    })
  })

  describe('reordering', () => {
    const namesNow = async () =>
      (await asOwner(() => statuses.list(apollo))).map((one) => one.name)

    it('moves one to the front', async () => {
      const cancelled = await named('Cancelled')

      await asOwner(() => statuses.update(apollo, cancelled, { afterId: null }))

      expect(await namesNow()).toEqual([
        'Cancelled',
        'To do',
        'In progress',
        'Done',
      ])
    })

    it('moves one behind a named neighbour', async () => {
      const cancelled = await named('Cancelled')
      const todo = await named('To do')

      await asOwner(() => statuses.update(apollo, cancelled, { afterId: todo }))

      expect(await namesNow()).toEqual([
        'To do',
        'Cancelled',
        'In progress',
        'Done',
      ])
    })

    it('handles being moved to where it already is', async () => {
      // The status is dropped from the neighbour list first, so `between` is
      // never asked for a key between a row and itself — which it refuses as
      // an equal pair.
      const inProgress = await named('In progress')
      const todo = await named('To do')

      await asOwner(() =>
        statuses.update(apollo, inProgress, { afterId: todo }),
      )

      expect(await namesNow()).toEqual([
        'To do',
        'In progress',
        'Done',
        'Cancelled',
      ])
    })

    it('refuses a neighbour that is not in this project', async () => {
      const mercury = (
        await asOwner(() =>
          projects.create({ name: 'Mercury', keyPrefix: 'MER', color: 'red' }),
        )
      ).id

      const elsewhere = (await asOwner(() => statuses.list(mercury)))[0]!.id
      const done = await named('Done')

      expect(
        await codeOf(
          asOwner(() => statuses.update(apollo, done, { afterId: elsewhere })),
        ),
      ).toBe('NOT_FOUND')
    })
  })

  describe('who may change them', () => {
    it('lets anyone who can see the project read them', async () => {
      await dataSource.query(
        `INSERT INTO project.members
           (org_id, project_id, user_id, role, created_by, updated_by)
         VALUES ($1, $2, $3, 'member', $4, $4)`,
        [acme, apollo, plain, SYSTEM_USER_ID],
      )

      await expect(
        as(acme, plain, 'member', () => statuses.list(apollo)),
      ).resolves.toHaveLength(4)
    })

    it('403s a project member changing one, 404s somebody outside', async () => {
      await dataSource.query(
        `INSERT INTO project.members
           (org_id, project_id, user_id, role, created_by, updated_by)
         VALUES ($1, $2, $3, 'member', $4, $4)`,
        [acme, apollo, plain, SYSTEM_USER_ID],
      )

      const todo = await named('To do')

      expect(
        await codeOf(
          as(acme, plain, 'member', () =>
            statuses.update(apollo, todo, { name: 'Nope' }),
          ),
        ),
      ).toBe('FORBIDDEN')

      await dataSource.query(`DELETE FROM project.members WHERE user_id = $1`, [
        plain,
      ])

      // Outside the project entirely: the refusal must not confirm it exists.
      expect(
        await codeOf(
          as(acme, plain, 'member', () =>
            statuses.update(apollo, todo, { name: 'Nope' }),
          ),
        ),
      ).toBe('NOT_FOUND')
    })
  })
})
