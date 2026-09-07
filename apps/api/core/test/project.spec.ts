import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { OrgRole } from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { createOrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { runWithRequestContext } from '#shared/org-scope/request-context'
import { SYSTEM_USER_ID } from '#shared/system-user'

import { AuditService } from '../src/modules/audit/audit.service'
import { AuditLog } from '../src/modules/audit/log.entity'
import { Project } from '../src/modules/project/project.entity'
import { ProjectService } from '../src/modules/project/project.service'
import { PermissionService } from '../src/permission/permission.service'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

/**
 * Projects, and the two rules the database cannot hold on its own: only an
 * owner or an admin may start one, and a project arrives with the statuses it
 * needs to hold work.
 *
 * The second is not cosmetic. `task.tasks.status_id` is NOT NULL, so a project
 * with no statuses rejects the first task filed in it — and looks completely
 * normal in every list until somebody tries.
 */
describe.skipIf(!hasTestDatabase)('project', () => {
  let dataSource: DataSource
  let projects: ProjectService
  let acme: string
  let globex: string
  let owner: string
  let admin: string
  let plain: string

  /** A request, as the guard would have set it up. */
  const as = <R>(
    orgId: string | null,
    userId: string,
    orgRole: OrgRole | null,
    fn: () => R,
  ): R => runWithRequestContext({ orgId, userId, orgRole, sessionId: null }, fn)

  // `username` is CHECKed as a-z0-9_, so no hyphens here.
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

  const newOrg = async (slug: string): Promise<string> => {
    const [org] = (await dataSource.query(
      `INSERT INTO organization.organizations (name, slug, created_by, updated_by)
       VALUES ($1, $1, $2, $2) RETURNING id`,
      [slug, SYSTEM_USER_ID],
    )) as { id: string }[]

    return org.id
  }

  const statusesOf = (projectId: string) =>
    dataSource.query(
      `SELECT name, color, sort_order, is_default, is_done_type,
              is_cancelled_type
         FROM project.statuses
        WHERE project_id = $1
        ORDER BY sort_order`,
      [projectId],
    ) as Promise<
      {
        name: string
        color: string
        sort_order: string
        is_default: boolean
        is_done_type: boolean
        is_cancelled_type: boolean
      }[]
    >

  const countOf = async (table: string, where = 'TRUE'): Promise<number> => {
    const [row] = (await dataSource.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE ${where}`,
    )) as { n: number }[]

    return row!.n
  }

  const codeOf = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise
      return 'did not throw'
    } catch (error) {
      return error instanceof ApiException ? error.code : String(error)
    }
  }

  const joinProject = (projectId: string, userId: string, role: string) =>
    dataSource.query(
      `INSERT INTO project.members
         (org_id, project_id, user_id, role, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [acme, projectId, userId, role, SYSTEM_USER_ID],
    )

  const archive = (projectId: string) =>
    dataSource.query(
      `UPDATE project.projects SET archived_at = now() WHERE id = $1`,
      [projectId],
    )

  const create = (userId: string, orgRole: OrgRole, name: string) =>
    as(acme, userId, orgRole, () =>
      projects.create({ name, keyPrefix: 'DEV', color: 'blue' }),
    )

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()

    projects = new ProjectService(
      createOrgScopedRepository(dataSource, Project),
      dataSource,
      new PermissionService(),
      new AuditService(createOrgScopedRepository(dataSource, AuditLog)),
    )

    owner = await newUser('p_owner')
    admin = await newUser('p_admin')
    plain = await newUser('p_plain')
  }, 60_000)

  afterAll(async () => {
    await dataSource?.destroy()
  })

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM audit.logs`)
    await dataSource.query(`DELETE FROM project.projects`)
    await dataSource.query(`DELETE FROM organization.organizations`)

    acme = await newOrg('acme')
    globex = await newOrg('globex')
  })

  describe('who may create one', () => {
    it('lets an owner', async () => {
      const project = await create(owner, 'owner', 'Apollo')

      expect(project.name).toBe('Apollo')
      expect(project.keyPrefix).toBe('DEV')
    })

    it('lets an admin', async () => {
      await expect(create(admin, 'admin', 'Apollo')).resolves.toMatchObject({
        name: 'Apollo',
      })
    })

    it('🔒 refuses a member', async () => {
      // docs/04-features/phase-1.md#project. `ability.ts` said the opposite
      // until §4 — a member could start a project — and nothing called it, so
      // nothing disagreed. At ~100 people this is the rule that keeps projects
      // from appearing faster than anyone tidies them away.
      expect(await codeOf(create(plain, 'member', 'Apollo'))).toBe('FORBIDDEN')
      expect(await countOf('project.projects')).toBe(0)
    })
  })

  describe('what a new project arrives with', () => {
    let apollo: string

    beforeEach(async () => {
      apollo = (await create(owner, 'owner', 'Apollo')).id
    })

    it('has the four default statuses, in order', async () => {
      const statuses = await statusesOf(apollo)

      expect(statuses.map((status) => status.name)).toEqual([
        'To do',
        'In progress',
        'Done',
        'Cancelled',
      ])
    })

    it('marks exactly one of each kind', async () => {
      const statuses = await statusesOf(apollo)

      expect(statuses.filter((one) => one.is_default)).toHaveLength(1)
      expect(statuses.filter((one) => one.is_done_type)).toHaveLength(1)
      // The one that reads like something to add later. Adding it later is the
      // failure: work decided against goes to Done instead, and every closed
      // sprint's progress is wrong from then on.
      expect(statuses.filter((one) => one.is_cancelled_type)).toHaveLength(1)
    })

    it('orders the statuses by bytes the way it inserted them', async () => {
      // 🔒 `sort_order` is `text COLLATE "C"`, so Postgres compares bytes. The
      // query above already ordered by it; this asserts that order is the one
      // the four were written in rather than a coincidence of short strings.
      const keys = (await statusesOf(apollo)).map((one) => one.sort_order)

      expect([...keys].sort()).toEqual(keys)
      expect(new Set(keys).size).toBe(4)
    })

    it('makes the creator its admin', async () => {
      // Without the row the creator would not see the project in their own
      // sidebar unless they happened to run the organisation.
      const [row] = (await dataSource.query(
        `SELECT role FROM project.members WHERE user_id = $1`,
        [owner],
      )) as { role: string }[]

      expect(row?.role).toBe('admin')
    })

    it('writes one audit row, in the same transaction', async () => {
      const [entry] = (await dataSource.query(
        `SELECT org_id, entity_type, action FROM audit.logs`,
      )) as { org_id: string; entity_type: string; action: string }[]

      expect(entry).toEqual({
        org_id: acme,
        entity_type: 'project',
        action: 'created',
      })
    })
  })

  describe('names', () => {
    beforeEach(async () => {
      await create(owner, 'owner', 'Apollo')
    })

    it('refuses one another live project in this org holds', async () => {
      expect(await codeOf(create(owner, 'owner', 'Apollo'))).toBe('NAME_TAKEN')
    })

    it('allows the same name in a different organisation', async () => {
      // The uniqueness is `(org_id, name)`. Two companies both having a
      // project called Apollo is not a conflict.
      await expect(
        as(globex, owner, 'owner', () =>
          projects.create({
            name: 'Apollo',
            keyPrefix: 'APL',
            color: 'green',
          }),
        ),
      ).resolves.toMatchObject({ name: 'Apollo' })
    })

    it('leaves no statuses behind when the name is taken', async () => {
      // The whole create is one transaction. A half-committed one would show
      // up here as eight statuses for one project, or as four belonging to a
      // project row that never existed.
      await codeOf(create(owner, 'owner', 'Apollo'))

      expect(await countOf('project.projects')).toBe(1)
      expect(await countOf('project.statuses')).toBe(4)
      expect(await countOf('project.members')).toBe(1)
    })
  })

  describe('🔒 who may see which project', () => {
    let apollo: string
    let mercury: string

    beforeEach(async () => {
      // Two projects the owner made. `plain` is put into one of them and left
      // out of the other, which is the whole shape of the rule.
      apollo = (await create(owner, 'owner', 'Apollo')).id
      mercury = (await create(owner, 'owner', 'Mercury')).id

      await joinProject(apollo, plain, 'member')
    })

    const namesFor = async (userId: string, orgRole: OrgRole) =>
      (await as(acme, userId, orgRole, () => projects.list())).map(
        (project) => project.name,
      )

    it('shows an owner every project in the organisation', async () => {
      // Including Mercury, which they are not a member of. This is what keeps
      // a project whose members have all left from becoming unreachable.
      expect(await namesFor(owner, 'owner')).toEqual(['Apollo', 'Mercury'])
    })

    it('shows an admin every project in the organisation', async () => {
      expect(await namesFor(admin, 'admin')).toEqual(['Apollo', 'Mercury'])
    })

    it('shows a member only the projects they have joined', async () => {
      expect(await namesFor(plain, 'member')).toEqual(['Apollo'])
    })

    it('reports the caller’s own role in each project', async () => {
      const [apolloView] = await as(acme, plain, 'member', () =>
        projects.list(),
      )

      expect(apolloView?.role).toBe('member')

      // The owner is in Apollo because they created it, and not in Mercury.
      const forOwner = await as(acme, owner, 'owner', () => projects.list())

      expect(forOwner.map((one) => one.role)).toEqual(['admin', 'admin'])
    })

    it('answers 404, not 403, for a project a member has not joined', async () => {
      // A 403 would confirm that a project with that id exists in their
      // organisation, which is exactly what the rule withholds.
      expect(
        await codeOf(
          as(acme, plain, 'member', () => projects.findById(mercury)),
        ),
      ).toBe('NOT_FOUND')
    })

    it('lets a member open the project they are in', async () => {
      const project = await as(acme, plain, 'member', () =>
        projects.findById(apollo),
      )

      expect(project).toMatchObject({ name: 'Apollo', role: 'member' })
    })

    it('lets an owner open a project they are not in', async () => {
      const project = await as(acme, admin, 'admin', () =>
        projects.findById(mercury),
      )

      // Visible, with no project role of their own — the sidebar uses that to
      // decide what to draw, and it is not what let them in.
      expect(project).toMatchObject({ name: 'Mercury', role: null })
    })

    it('🔒 never shows a project belonging to another organisation', async () => {
      await as(globex, owner, 'owner', () =>
        projects.create({ name: 'Zeus', keyPrefix: 'ZEU', color: 'red' }),
      )

      // Zeus is in neither list, and Apollo is in neither of Globex's.
      expect(await namesFor(owner, 'owner')).toEqual(['Apollo', 'Mercury'])
      expect(
        (await as(globex, owner, 'owner', () => projects.list())).map(
          (one) => one.name,
        ),
      ).toEqual(['Zeus'])

      // The id is not a way in either: the org scope runs before the
      // project one, so it reads as a project that does not exist.
      const [zeus] = (await dataSource.query(
        `SELECT id FROM project.projects WHERE name = 'Zeus'`,
      )) as { id: string }[]

      expect(
        await codeOf(
          as(acme, owner, 'owner', () => projects.findById(zeus!.id)),
        ),
      ).toBe('NOT_FOUND')
    })

    it('🔒 the list agrees with the permission rules, role by role', async () => {
      // The one rule this codebase states twice — as SQL in
      // `ProjectService.list` and as CASL in `ability.ts` — because `can()`
      // answers about one row and a list needs a WHERE clause. Nothing but
      // this test stops the two drifting apart.
      const permissions = new PermissionService()
      const everyProject = [apollo, mercury]

      for (const [userId, orgRole] of [
        [owner, 'owner'],
        [admin, 'admin'],
        [plain, 'member'],
      ] as [string, OrgRole][]) {
        const listed = await as(acme, userId, orgRole, () => projects.list())

        const allowed = everyProject.filter((id) => {
          const role = listed.find((one) => one.id === id)?.role ?? null

          return permissions.can(
            {
              userId,
              orgId: acme,
              orgRole,
              ...(role === null ? {} : { projectRoles: { [id]: role } }),
            },
            'read',
            'Project',
            { id },
          )
        })

        expect(listed.map((one) => one.id).sort()).toEqual(allowed.sort())
      }
    })
  })

  describe('archived projects', () => {
    let apollo: string

    beforeEach(async () => {
      apollo = (await create(owner, 'owner', 'Apollo')).id
      await create(owner, 'owner', 'Mercury')
      await archive(apollo)
    })

    it('are left out of the list by default', async () => {
      // Which is what the sidebar and every picker ask for.
      const listed = await as(acme, owner, 'owner', () => projects.list())

      expect(listed.map((one) => one.name)).toEqual(['Mercury'])
    })

    it('are included when asked for', async () => {
      const listed = await as(acme, owner, 'owner', () =>
        projects.list({ includeArchived: true }),
      )

      expect(listed.map((one) => one.name)).toEqual(['Apollo', 'Mercury'])
    })

    it('can still be opened directly', async () => {
      // Archive hides, it does not revoke: members keep their access to the
      // history. Only `deleted_at` takes a project away.
      await expect(
        as(acme, owner, 'owner', () => projects.findById(apollo)),
      ).resolves.toMatchObject({ name: 'Apollo' })
    })
  })
})
