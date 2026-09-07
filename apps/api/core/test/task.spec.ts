import type { ConfigService } from '@nestjs/config'
import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { ListTasksQuery, MyTasksQuery, OrgRole } from '@repo/shared'

import { CascadeSoftDelete } from '#shared/entity/cascade-soft-delete'
import { ApiException } from '#shared/http/api-exception'
import { createOrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { runWithRequestContext } from '#shared/org-scope/request-context'
import { SYSTEM_USER_ID } from '#shared/system-user'

import type { Env } from '../src/config/env'
import { AuditService } from '../src/modules/audit/audit.service'
import { AuditLog } from '../src/modules/audit/log.entity'
import { User } from '../src/modules/iam/user/user.entity'
import { UserService } from '../src/modules/iam/user/user.service'
import { EmailService } from '../src/modules/notify/email.service'
import { OrganizationMember } from '../src/modules/organization/member.entity'
import { MemberService } from '../src/modules/organization/member.service'
import { ProjectMember } from '../src/modules/project/project-member.entity'
import { ProjectMemberService } from '../src/modules/project/project-member.service'
import { Project } from '../src/modules/project/project.entity'
import { ProjectService } from '../src/modules/project/project.service'
import { Status } from '../src/modules/project/status.entity'
import { StatusService } from '../src/modules/project/status.service'
import { Assignee } from '../src/modules/task/assignee.entity'
import { Task } from '../src/modules/task/task.entity'
import { TaskService, type TaskView } from '../src/modules/task/task.service'
import { TasksInStatusService } from '../src/modules/task/tasks-in-status.service'
import { PermissionService } from '../src/permission/permission.service'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

/**
 * Tasks: the number that must never be reissued, the completion columns that
 * have to keep agreeing with the status, and who may do what to a row whose
 * permissions live one table up.
 *
 * The two 🔒 items here are the ones that cannot be repaired after the fact.
 * A reissued task number silently repoints every `DEV-87` anybody ever pasted
 * into a chat; a completion date that disagrees with the board makes every
 * "what did we ship" answer wrong with nothing to notice it by.
 */
describe.skipIf(!hasTestDatabase)('tasks', () => {
  let dataSource: DataSource
  let projects: ProjectService
  let projectMembers: ProjectMemberService
  let statuses: StatusService
  let tasks: TaskService
  let acme: string
  let owner: string
  let member: string
  let plain: string
  let stranger: string
  let apollo: string

  const as = <R>(
    orgId: string | null,
    userId: string,
    orgRole: OrgRole | null,
    fn: () => R,
  ): R => runWithRequestContext({ orgId, userId, orgRole, sessionId: null }, fn)

  const asOwner = <R>(fn: () => R): R => as(acme, owner, 'owner', fn)
  /** A project member: may file and edit work, may not delete it. */
  const asMember = <R>(fn: () => R): R => as(acme, member, 'member', fn)
  /** In the organisation, in no project. Should not see this project at all. */
  const asPlain = <R>(fn: () => R): R => as(acme, plain, 'member', fn)

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

  const statusNamed = async (name: string): Promise<string> =>
    (await asOwner(() => statuses.list(apollo))).find(
      (one) => one.name === name,
    )!.id

  const completionOf = async (
    taskId: string,
  ): Promise<{ at: Date | null; by: string | null }> => {
    const [row] = (await dataSource.query(
      `SELECT completed_at, completed_by FROM task.tasks WHERE id = $1`,
      [taskId],
    )) as { completed_at: Date | null; completed_by: string | null }[]

    return { at: row!.completed_at, by: row!.completed_by }
  }

  /** The default query, so a test only spells out what it is actually varying. */
  const LIST: ListTasksQuery = { sort: 'order', dir: 'asc', limit: 50 }

  const board = async (
    query: Partial<ListTasksQuery> = {},
  ): Promise<TaskView[]> =>
    (await tasks.list(apollo, { ...LIST, ...query })).data

  const titlesInOrder = async (): Promise<string[]> =>
    (await asOwner(() => board())).map((task) => task.title)

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()

    const permissions = new PermissionService()
    const audit = new AuditService(
      createOrgScopedRepository(dataSource, AuditLog),
    )
    const users = new UserService(createOrgScopedRepository(dataSource, User))

    projects = new ProjectService(
      createOrgScopedRepository(dataSource, Project),
      dataSource,
      permissions,
      audit,
      new CascadeSoftDelete(dataSource),
    )
    projectMembers = new ProjectMemberService(
      createOrgScopedRepository(dataSource, ProjectMember),
      dataSource,
      projects,
      new MemberService(
        createOrgScopedRepository(dataSource, OrganizationMember),
        dataSource,
        permissions,
        audit,
      ),
      users,
      audit,
    )
    statuses = new StatusService(
      createOrgScopedRepository(dataSource, Status),
      dataSource,
      projects,
      new TasksInStatusService(createOrgScopedRepository(dataSource, Task)),
      audit,
    )
    tasks = new TaskService(
      createOrgScopedRepository(dataSource, Task),
      createOrgScopedRepository(dataSource, Assignee),
      dataSource,
      projects,
      projectMembers,
      statuses,
      permissions,
      audit,
      new CascadeSoftDelete(dataSource),
      users,
      new EmailService(),
      {
        get: () => 'http://localhost:3000',
      } as unknown as ConfigService<Env, true>,
    )

    owner = await newUser('t_owner')
    member = await newUser('t_member')
    plain = await newUser('t_plain')
    stranger = await newUser('t_stranger')
  }, 60_000)

  afterAll(async () => {
    await dataSource?.destroy()
  })

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM notify.outbox`)
    await dataSource.query(`DELETE FROM task.assignees`)
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
      [member, 'member'],
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

    await asOwner(() => projectMembers.add(apollo, member, 'member'))
  })

  describe('quick add', () => {
    it('needs a title and nothing else', async () => {
      const task = await asMember(() =>
        tasks.create(apollo, { title: 'ทำสไลด์' }),
      )

      expect(task).toMatchObject({
        title: 'ทำสไลด์',
        number: 1,
        key: 'APL-1',
        statusId: await statusNamed('To do'),
        priority: null,
        dueDate: null,
        completedAt: null,
      })
    })

    it('starts new work in the project default, not in whatever sorts first', async () => {
      // Move the default off the first column, so "the default" and "the first
      // status" stop being the same answer.
      const inProgress = await statusNamed('In progress')

      await asOwner(() =>
        statuses.update(apollo, inProgress, { isDefault: true }),
      )

      const task = await asMember(() => tasks.create(apollo, { title: 'ต่อ' }))

      expect(task.statusId).toBe(inProgress)
    })

    it('refuses a status belonging to another project', async () => {
      const other = await asOwner(() =>
        projects.create({ name: 'Zephyr', keyPrefix: 'ZPH', color: 'red' }),
      )
      const elsewhere = (await asOwner(() => statuses.list(other.id)))[0]!.id

      expect(
        await codeOf(
          asOwner(() =>
            tasks.create(apollo, { title: 'x', statusId: elsewhere }),
          ),
        ),
      ).toBe('NOT_FOUND')
    })
  })

  describe('🔒 the task number', () => {
    it('counts up from one, and the key is assembled from the prefix', async () => {
      const first = await asOwner(() =>
        tasks.create(apollo, { title: 'หนึ่ง' }),
      )
      const second = await asOwner(() => tasks.create(apollo, { title: 'สอง' }))

      expect([first.key, second.key]).toEqual(['APL-1', 'APL-2'])
    })

    it('never reissues a number, even when the task holding it is deleted', async () => {
      const first = await asOwner(() =>
        tasks.create(apollo, { title: 'หนึ่ง' }),
      )

      await asOwner(() => tasks.remove(first.id))

      const next = await asOwner(() => tasks.create(apollo, { title: 'สอง' }))

      // `MAX(number) + 1` would answer 1 here, and every `APL-1` anybody had
      // written down would start pointing at different work.
      expect(next.number).toBe(2)
    })

    it('hands out distinct numbers to simultaneous creates', async () => {
      const created = await asOwner(() =>
        Promise.all(
          Array.from({ length: 5 }, (_, index) =>
            tasks.create(apollo, { title: `พร้อมกัน ${index}` }),
          ),
        ),
      )

      expect([...new Set(created.map((task) => task.number))].sort()).toEqual([
        1, 2, 3, 4, 5,
      ])
    })

    it('counts per project, not per organisation', async () => {
      const other = await asOwner(() =>
        projects.create({ name: 'Zephyr', keyPrefix: 'ZPH', color: 'red' }),
      )

      await asOwner(() => tasks.create(apollo, { title: 'a' }))
      const elsewhere = await asOwner(() =>
        tasks.create(other.id, { title: 'b' }),
      )

      expect(elsewhere.key).toBe('ZPH-1')
    })
  })

  describe('🔒 completion follows the status (direction A)', () => {
    it('stamps both columns when the task reaches a done status', async () => {
      const task = await asMember(() => tasks.create(apollo, { title: 'งาน' }))
      const done = await statusNamed('Done')

      await asMember(() => tasks.update(task.id, { statusId: done }))

      const { at, by } = await completionOf(task.id)

      expect(at).toBeInstanceOf(Date)
      expect(by).toBe(member)
    })

    it('clears both when it leaves again', async () => {
      const task = await asMember(() => tasks.create(apollo, { title: 'งาน' }))
      const done = await statusNamed('Done')
      const todo = await statusNamed('To do')

      await asMember(() => tasks.update(task.id, { statusId: done }))
      await asMember(() => tasks.update(task.id, { statusId: todo }))

      expect(await completionOf(task.id)).toEqual({ at: null, by: null })
    })

    it('keeps the original date when moving between two done statuses', async () => {
      const task = await asMember(() => tasks.create(apollo, { title: 'งาน' }))
      const done = await statusNamed('Done')

      await asMember(() => tasks.update(task.id, { statusId: done }))
      const first = await completionOf(task.id)

      const shipped = await asOwner(() =>
        statuses.create(apollo, {
          name: 'Shipped',
          color: 'green',
          kind: 'done',
        }),
      )

      await asMember(() => tasks.update(task.id, { statusId: shipped.id }))

      // Done → Shipped is not a second completion. The work finished when it
      // finished.
      expect(await completionOf(task.id)).toEqual(first)
    })

    it('counts a task created straight into a done status', async () => {
      const done = await statusNamed('Done')
      const task = await asMember(() =>
        tasks.create(apollo, { title: 'เสร็จตั้งแต่แรก', statusId: done }),
      )

      expect((await completionOf(task.id)).at).toBeInstanceOf(Date)
    })

    it('leaves the date alone on an edit that does not change the column', async () => {
      const task = await asMember(() => tasks.create(apollo, { title: 'งาน' }))
      const done = await statusNamed('Done')

      await asMember(() => tasks.update(task.id, { statusId: done }))
      const before = await completionOf(task.id)

      await asMember(() => tasks.update(task.id, { title: 'งาน (แก้ชื่อ)' }))

      expect(await completionOf(task.id)).toEqual(before)
    })
  })

  describe('ordering', () => {
    const three = async (): Promise<string[]> => {
      const created = []

      for (const title of ['หนึ่ง', 'สอง', 'สาม']) {
        created.push((await asOwner(() => tasks.create(apollo, { title }))).id)
      }

      return created
    }

    it('appends new work to the bottom of its column', async () => {
      await three()

      expect(await titlesInOrder()).toEqual(['หนึ่ง', 'สอง', 'สาม'])
    })

    it('moves to the front on afterId null', async () => {
      const [, , third] = await three()

      await asOwner(() => tasks.update(third!, { afterId: null }))

      expect(await titlesInOrder()).toEqual(['สาม', 'หนึ่ง', 'สอง'])
    })

    it('moves behind a named neighbour', async () => {
      const [first, , third] = await three()

      await asOwner(() => tasks.update(third!, { afterId: first! }))

      expect(await titlesInOrder()).toEqual(['หนึ่ง', 'สาม', 'สอง'])
    })

    it('appends to the bottom of the new column when the status changes', async () => {
      const [first, second] = await three()
      const done = await statusNamed('Done')

      await asOwner(() => tasks.update(second!, { statusId: done }))
      await asOwner(() => tasks.update(first!, { statusId: done }))

      const inDone = (await asOwner(() => board()))
        .filter((task) => task.statusId === done)
        .map((task) => task.title)

      // Not "wherever its old key happened to fall" — a card dropped in Done
      // lands at the bottom of Done.
      expect(inDone).toEqual(['สอง', 'หนึ่ง'])
    })

    it('refuses an afterId that is in a different column', async () => {
      const [first, second] = await three()
      const done = await statusNamed('Done')

      await asOwner(() => tasks.update(first!, { statusId: done }))

      expect(
        await codeOf(asOwner(() => tasks.update(second!, { afterId: first! }))),
      ).toBe('NOT_FOUND')
    })

    it('refuses an afterId that is not a task in this project', async () => {
      const [first] = await three()

      expect(
        await codeOf(
          asOwner(() =>
            tasks.update(first!, {
              afterId: '11111111-1111-1111-1111-111111111111',
            }),
          ),
        ),
      ).toBe('NOT_FOUND')
    })
  })

  describe('assignees', () => {
    it('gives a task to somebody already in the project', async () => {
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      expect(
        await asOwner(() =>
          tasks.assign(task.id, { userId: member, addToProject: false }),
        ),
      ).toEqual([member])
    })

    it('refuses the same person twice', async () => {
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      await asOwner(() =>
        tasks.assign(task.id, { userId: member, addToProject: false }),
      )

      expect(
        await codeOf(
          asOwner(() =>
            tasks.assign(task.id, { userId: member, addToProject: false }),
          ),
        ),
      ).toBe('ALREADY_ASSIGNED')
    })

    it('🔒 will not quietly add somebody to the project to assign them', async () => {
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      expect(
        await codeOf(
          asOwner(() =>
            tasks.assign(task.id, { userId: plain, addToProject: false }),
          ),
        ),
      ).toBe('NOT_PROJECT_MEMBER')

      // And nothing was written on the way to the refusal: membership grants
      // every task, comment and attachment in the project.
      expect(await asOwner(() => projectMembers.find(apollo, plain))).toBeNull()
    })

    it('adds them when the client confirms', async () => {
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      await asOwner(() =>
        tasks.assign(task.id, { userId: plain, addToProject: true }),
      )

      expect(
        await asOwner(() => projectMembers.find(apollo, plain)),
      ).toMatchObject({ role: 'member' })
    })

    it('🔒 refuses somebody from outside the organisation, confirmed or not', async () => {
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      expect(
        await codeOf(
          asOwner(() =>
            tasks.assign(task.id, { userId: stranger, addToProject: true }),
          ),
        ),
      ).toBe('NOT_FOUND')
    })

    it('unassigns without taking them out of the project', async () => {
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      await asOwner(() =>
        tasks.assign(task.id, { userId: member, addToProject: false }),
      )

      expect(await asOwner(() => tasks.unassign(task.id, member))).toEqual([])
      expect(
        await asOwner(() => projectMembers.find(apollo, member)),
      ).not.toBeNull()
    })

    it('carries the assignees on the list', async () => {
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      await asOwner(() =>
        tasks.assign(task.id, { userId: member, addToProject: false }),
      )

      expect((await asOwner(() => board()))[0]!.assigneeIds).toEqual([member])
    })
  })

  describe('permissions', () => {
    it('hides the project entirely from an org member who is not in it', async () => {
      await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      // 404, not 403: a 403 would confirm the project exists, which is the
      // thing project-level visibility withholds.
      expect(await codeOf(asPlain(() => board()))).toBe('NOT_FOUND')
    })

    it('answers 404 for a task in a project the caller cannot see', async () => {
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      expect(await codeOf(asPlain(() => tasks.findById(task.id)))).toBe(
        'NOT_FOUND',
      )
    })

    it('lets a project member file and edit work', async () => {
      const task = await asMember(() => tasks.create(apollo, { title: 'งาน' }))

      await asMember(() => tasks.update(task.id, { title: 'งาน 2' }))

      expect((await asMember(() => tasks.findById(task.id))).title).toBe(
        'งาน 2',
      )
    })

    it('🔒 does not let a project member delete work', async () => {
      const task = await asMember(() => tasks.create(apollo, { title: 'งาน' }))

      // 403 rather than 404: they can see it, so hiding it now would read as a
      // bug. docs/01-architecture.md — a project member reads and writes, an
      // admin disposes.
      expect(await codeOf(asMember(() => tasks.remove(task.id)))).toBe(
        'FORBIDDEN',
      )
    })

    it('lets a project admin delete work', async () => {
      const task = await asMember(() => tasks.create(apollo, { title: 'งาน' }))

      await asOwner(() => projectMembers.changeRole(apollo, member, 'admin'))
      await asMember(() => tasks.remove(task.id))

      expect(await asOwner(() => board())).toEqual([])
    })

    it('lets an org owner work in a project they never joined', async () => {
      // The escape hatch for a project whose members have all left.
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      await asOwner(() => tasks.remove(task.id))

      expect(await asOwner(() => board())).toEqual([])
    })
  })

  describe('an archived project is read-only', () => {
    beforeEach(async () => {
      await asOwner(() => tasks.create(apollo, { title: 'ของเดิม' }))
      await asOwner(() => projects.setArchived(apollo, true))
    })

    it('takes no new work', async () => {
      expect(
        await codeOf(asOwner(() => tasks.create(apollo, { title: 'ใหม่' }))),
      ).toBe('PROJECT_ARCHIVED')
    })

    it('takes no edits', async () => {
      const [task] = await asOwner(() => board())

      expect(
        await codeOf(asOwner(() => tasks.update(task!.id, { title: 'x' }))),
      ).toBe('PROJECT_ARCHIVED')
    })

    it('still reads, because archiving is not deleting', async () => {
      expect(await titlesInOrder()).toEqual(['ของเดิม'])
    })

    it('works again once it is out of the archive', async () => {
      await asOwner(() => projects.setArchived(apollo, false))

      expect(
        (await asOwner(() => tasks.create(apollo, { title: 'ใหม่' }))).number,
      ).toBe(2)
    })
  })

  describe('deleting', () => {
    it('takes the task out of the list and leaves the row soft-deleted', async () => {
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      await asOwner(() => tasks.remove(task.id))

      expect(await asOwner(() => board())).toEqual([])

      const [row] = (await dataSource.query(
        `SELECT deleted_at, deleted_by FROM task.tasks WHERE id = $1`,
        [task.id],
      )) as { deleted_at: Date | null; deleted_by: string | null }[]

      expect(row!.deleted_at).toBeInstanceOf(Date)
      expect(row!.deleted_by).toBe(owner)
    })

    it('goes with the project when the project goes', async () => {
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      await asOwner(() => projects.remove(apollo))

      const [row] = (await dataSource.query(
        `SELECT deleted_at FROM task.tasks WHERE id = $1`,
        [task.id],
      )) as { deleted_at: Date | null }[]

      expect(row!.deleted_at).toBeInstanceOf(Date)
    })
  })

  describe('filtering, sorting and searching', () => {
    /** Three tasks whose fields differ in every dimension the list filters on. */
    const spread = async (): Promise<Record<string, string>> => {
      const made: Record<string, string> = {}

      const rows = [
        { title: 'เขียนสเปก', priority: 'urgent' as const, due: '2026-10-01' },
        { title: 'รีวิวโค้ด', priority: 'low' as const, due: '2026-09-10' },
        { title: 'เขียนเทส', priority: undefined, due: undefined },
      ]

      for (const row of rows) {
        const task = await asOwner(() =>
          tasks.create(apollo, {
            title: row.title,
            ...(row.priority ? { priority: row.priority } : {}),
            ...(row.due
              ? { dueDate: new Date(`${row.due}T00:00:00+07:00`) }
              : {}),
          }),
        )

        made[row.title] = task.id
      }

      return made
    }

    it('matches a title case-insensitively, anywhere in it', async () => {
      await spread()

      expect(
        (await asOwner(() => board({ q: 'เขียน' }))).map((t) => t.title),
      ).toEqual(['เขียนสเปก', 'เขียนเทส'])
    })

    it('takes several values in one filter as "is in"', async () => {
      await spread()

      const found = await asOwner(() => board({ priority: ['urgent', 'low'] }))

      expect(found.map((task) => task.title).sort()).toEqual(
        ['รีวิวโค้ด', 'เขียนสเปก'].sort(),
      )
    })

    it('ANDs different filters rather than ORing them', async () => {
      await spread()

      // Both conditions hold for nothing: the urgent one is not called รีวิว.
      expect(
        await asOwner(() => board({ priority: ['urgent'], q: 'รีวิว' })),
      ).toEqual([])
    })

    it('brackets a due date range, and a task with no date is in neither end', async () => {
      await spread()

      const found = await asOwner(() =>
        board({ dueBefore: new Date('2026-09-30T23:59:59+07:00') }),
      )

      expect(found.map((task) => task.title)).toEqual(['รีวิวโค้ด'])
    })

    it('🔒 sorts by due date with the undated last, not missing', async () => {
      await spread()

      // COALESCE(due_date, 'infinity'): a nullable ordering column cannot be
      // paged with a keyset cursor, and dropping the undated rows entirely
      // would be the other way to get a NOT NULL expression.
      expect(
        (await asOwner(() => board({ sort: 'dueDate' }))).map((t) => t.title),
      ).toEqual(['รีวิวโค้ด', 'เขียนสเปก', 'เขียนเทส'])
    })

    it('🔒 sorts by priority as a rank, not alphabetically', async () => {
      await spread()

      // Alphabetically 'high' sits between 'low' and 'urgent', which is the
      // exact wrong answer for the question the column is asked.
      expect(
        (await asOwner(() => board({ sort: 'priority', dir: 'desc' }))).map(
          (t) => t.priority,
        ),
      ).toEqual(['urgent', 'low', null])
    })

    it('filters by assignee without multiplying the rows', async () => {
      const made = await spread()

      await asOwner(() =>
        tasks.assign(made['เขียนสเปก']!, {
          userId: member,
          addToProject: false,
        }),
      )
      await asOwner(() =>
        tasks.assign(made['เขียนสเปก']!, {
          userId: owner,
          addToProject: false,
        }),
      )

      // Two assignees, one row — a join here would return the task twice and
      // make `limit` a number of assignments.
      expect(
        (await asOwner(() => board({ assigneeId: [member] }))).map(
          (t) => t.title,
        ),
      ).toEqual(['เขียนสเปก'])
    })
  })

  describe('🔒 cursor pagination', () => {
    const twelve = async (): Promise<void> => {
      for (let index = 0; index < 12; index += 1) {
        await asOwner(() =>
          tasks.create(apollo, {
            title: `งาน ${String(index).padStart(2, '0')}`,
          }),
        )
      }
    }

    it('walks the whole list without repeating or skipping a row', async () => {
      await twelve()

      const seen: string[] = []
      let cursor: string | undefined

      do {
        const page = await asOwner(() =>
          tasks.list(apollo, {
            ...LIST,
            limit: 5,
            ...(cursor ? { cursor } : {}),
          }),
        )

        seen.push(...page.data.map((task) => task.title))
        cursor = page.meta.nextCursor ?? undefined
      } while (cursor)

      expect(seen).toHaveLength(12)
      expect(new Set(seen).size).toBe(12)
      expect(seen).toEqual([...seen].sort())
    })

    it('reports hasMore only while there is more', async () => {
      await twelve()

      const first = await asOwner(() =>
        tasks.list(apollo, { ...LIST, limit: 5 }),
      )
      const last = await asOwner(() =>
        tasks.list(apollo, { ...LIST, limit: 50 }),
      )

      expect(first.meta).toMatchObject({ hasMore: true })
      expect(first.meta.nextCursor).not.toBeNull()
      expect(last.meta).toEqual({ hasMore: false, nextCursor: null })
    })

    it('🔒 does not skip a row when one is inserted above the cursor', async () => {
      await twelve()

      const first = await asOwner(() =>
        tasks.list(apollo, { ...LIST, limit: 5 }),
      )

      // The move an offset cannot survive: this changes how many rows sit
      // before the reader's position between the two requests.
      const moved = first.data[4]!
      await asOwner(() => tasks.update(moved.id, { afterId: null }))

      const second = await asOwner(() =>
        tasks.list(apollo, {
          ...LIST,
          limit: 5,
          cursor: first.meta.nextCursor!,
        }),
      )

      // The keyset resumes from the row itself, so nothing before it can be
      // re-served and nothing after it is jumped over.
      expect(second.data.map((task) => task.title)).toEqual([
        'งาน 05',
        'งาน 06',
        'งาน 07',
        'งาน 08',
        'งาน 09',
      ])
    })

    it('answers a mangled cursor with 400, not 500', async () => {
      // They travel in URLs that people copy, edit and truncate.
      expect(
        await codeOf(
          asOwner(() =>
            tasks.list(apollo, { ...LIST, cursor: 'not-a-real-cursor' }),
          ),
        ),
      ).toBe('VALIDATION_FAILED')
    })
  })

  describe('My Tasks', () => {
    const mine = async (query: Partial<MyTasksQuery> = {}): Promise<string[]> =>
      (
        await asMember(() =>
          tasks.myTasks({ ...LIST, includeClosed: false, ...query }),
        )
      ).data.map((task) => task.title)

    const assignedToMember = async (title: string): Promise<string> => {
      const task = await asOwner(() => tasks.create(apollo, { title }))

      await asOwner(() =>
        tasks.assign(task.id, { userId: member, addToProject: false }),
      )

      return task.id
    }

    it('is what is assigned to the caller and nothing else', async () => {
      await assignedToMember('ของฉัน')
      await asOwner(() => tasks.create(apollo, { title: 'ของคนอื่น' }))

      expect(await mine()).toEqual(['ของฉัน'])
    })

    it('hides done and cancelled work by default', async () => {
      const id = await assignedToMember('เสร็จแล้ว')
      await assignedToMember('ยังไม่เสร็จ')
      const done = await statusNamed('Done')

      await asOwner(() => tasks.update(id, { statusId: done }))

      // Opening this should show what there is to do, not a pile of what has
      // already been dealt with.
      expect(await mine()).toEqual(['ยังไม่เสร็จ'])
      expect((await mine({ includeClosed: true })).sort()).toEqual(
        ['เสร็จแล้ว', 'ยังไม่เสร็จ'].sort(),
      )
    })

    it('also hides cancelled, not only done', async () => {
      const id = await assignedToMember('ยกเลิกไป')
      const cancelled = await statusNamed('Cancelled')

      await asOwner(() => tasks.update(id, { statusId: cancelled }))

      expect(await mine()).toEqual([])
    })

    it('🔒 drops work in a project the caller can no longer see', async () => {
      await assignedToMember('งานเก่า')

      // Being assigned is not the same as being able to see. Removing somebody
      // from a project leaves their assignment rows behind, and without the
      // visibility gate they would keep reading that project from here.
      await asOwner(() => projectMembers.remove(apollo, member))

      expect(await mine()).toEqual([])
    })

    it('leaves out work in an archived project', async () => {
      await assignedToMember('งานในคลัง')

      await asOwner(() => projects.setArchived(apollo, true))

      expect(await mine()).toEqual([])
    })
  })

  describe('the assignment email', () => {
    const outbox = async (): Promise<
      {
        recipient_id: string
        template: string
        payload_json: Record<string, unknown>
      }[]
    > =>
      (await dataSource.query(
        `SELECT recipient_id, template, payload_json FROM notify.outbox
          ORDER BY created_at ASC`,
      )) as {
        recipient_id: string
        template: string
        payload_json: Record<string, unknown>
      }[]

    it('queues one, with everything the message needs to say', async () => {
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      await asOwner(() =>
        tasks.assign(task.id, { userId: member, addToProject: false }),
      )

      const [queued] = await outbox()

      expect(queued).toMatchObject({
        recipient_id: member,
        template: 'task_assigned',
      })
      // Rendered by OutboxWorker long after this request, with no org
      // context — so every readable part travels in the payload.
      expect(queued!.payload_json).toMatchObject({
        taskKey: 'APL-1',
        title: 'งาน',
        projectName: 'Apollo',
        url: `http://localhost:3000/tasks/${task.id}`,
      })
    })

    it('⚠️ sends nothing when somebody assigns themselves', async () => {
      const task = await asMember(() => tasks.create(apollo, { title: 'งาน' }))

      await asMember(() =>
        tasks.assign(task.id, { userId: member, addToProject: false }),
      )

      expect(await outbox()).toEqual([])
    })

    it('🔒 queues nothing when the assignment itself fails', async () => {
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      await asOwner(() =>
        tasks.assign(task.id, { userId: member, addToProject: false }),
      )
      const before = await outbox()

      // The duplicate rolls the transaction back; the mail must go with it,
      // or somebody is told about work they were not actually given.
      expect(
        await codeOf(
          asOwner(() =>
            tasks.assign(task.id, { userId: member, addToProject: false }),
          ),
        ),
      ).toBe('ALREADY_ASSIGNED')
      expect(await outbox()).toEqual(before)
    })
  })

  describe('the activity log', () => {
    it('reads a task history back, newest first', async () => {
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))
      const done = await statusNamed('Done')

      await asOwner(() => tasks.update(task.id, { statusId: done }))
      await asOwner(() =>
        tasks.assign(task.id, { userId: member, addToProject: false }),
      )

      const history = await asOwner(() => tasks.activity(task.id))

      expect(history.map((row) => row.action)).toEqual([
        'assigned',
        'updated',
        'created',
      ])
    })

    it('needs only the right to see the task', async () => {
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      await expect(
        asMember(() => tasks.activity(task.id)),
      ).resolves.toHaveLength(1)
      expect(await codeOf(asPlain(() => tasks.activity(task.id)))).toBe(
        'NOT_FOUND',
      )
    })
  })

  describe('the audit trail', () => {
    it('records the assignee on the task, not the task on the assignee', async () => {
      const task = await asOwner(() => tasks.create(apollo, { title: 'งาน' }))

      await asOwner(() =>
        tasks.assign(task.id, { userId: member, addToProject: false }),
      )

      const [row] = (await dataSource.query(
        `SELECT entity_id, changes_json FROM audit.logs
          WHERE action = 'assigned'`,
      )) as { entity_id: string; changes_json: Record<string, unknown> }[]

      // 🔒 `entity_id` is the task: "what happened to this task" has to be
      // answerable, and a row keyed on the person answers it with nothing.
      expect(row!.entity_id).toBe(task.id)
      expect(row!.changes_json).toMatchObject({
        assigneeId: { from: null, to: member },
      })
    })
  })
})
