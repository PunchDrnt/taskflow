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
import { OrganizationMember } from '../src/modules/organization/member.entity'
import { MemberService } from '../src/modules/organization/member.service'
import { ProjectMember } from '../src/modules/project/project-member.entity'
import { ProjectMemberService } from '../src/modules/project/project-member.service'
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
  let projectMembers: ProjectMemberService
  let acme: string
  let globex: string
  let owner: string
  let admin: string
  let plain: string
  let outsider: string

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

  const joinOrg = (orgId: string, userId: string, role: OrgRole) =>
    dataSource.query(
      `INSERT INTO organization.members
         (org_id, user_id, role, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)`,
      [orgId, userId, role, SYSTEM_USER_ID],
    )

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
      audit,
    )

    owner = await newUser('p_owner')
    admin = await newUser('p_admin')
    plain = await newUser('p_plain')
    outsider = await newUser('p_outsider')
  }, 60_000)

  afterAll(async () => {
    await dataSource?.destroy()
  })

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM audit.logs`)
    await dataSource.query(`DELETE FROM project.projects`)
    await dataSource.query(`DELETE FROM organization.organizations`)

    await dataSource.query(`DELETE FROM organization.members`)

    acme = await newOrg('acme')
    globex = await newOrg('globex')

    // Everyone but `outsider` belongs to Acme; `outsider` belongs to Globex.
    // That split is what the cross-org case below turns on.
    for (const [userId, role] of [
      [owner, 'owner'],
      [admin, 'admin'],
      [plain, 'member'],
    ] as [string, OrgRole][]) {
      await joinOrg(acme, userId, role)
    }
    await joinOrg(globex, outsider, 'member')
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

  describe('members', () => {
    let apollo: string

    beforeEach(async () => {
      apollo = (await create(owner, 'owner', 'Apollo')).id
    })

    const membersOf = (userId: string, orgRole: OrgRole) =>
      as(acme, userId, orgRole, () => projectMembers.list(apollo))

    it('starts with the creator alone', async () => {
      expect(await membersOf(owner, 'owner')).toMatchObject([
        { userId: owner, role: 'admin' },
      ])
    })

    it('adds somebody in the organisation', async () => {
      await as(acme, owner, 'owner', () =>
        projectMembers.add(apollo, plain, 'member'),
      )

      expect(await membersOf(owner, 'owner')).toMatchObject([
        { userId: owner, role: 'admin' },
        { userId: plain, role: 'member' },
      ])
    })

    it('🔒 refuses somebody who is not in the organisation', async () => {
      // The database will not catch this. `project.members.user_id` references
      // `iam.users(id)` on its own — only `project_id` is composite with
      // `org_id` — so a person from another company inserts cleanly and then
      // holds a real membership that `ProjectService.list` honours.
      expect(
        await codeOf(
          as(acme, owner, 'owner', () =>
            projectMembers.add(apollo, outsider, 'member'),
          ),
        ),
      ).toBe('NOT_FOUND')

      expect(await countOf('project.members')).toBe(1)
    })

    it('refuses a second row for the same person', async () => {
      expect(
        await codeOf(
          as(acme, owner, 'owner', () =>
            projectMembers.add(apollo, owner, 'member'),
          ),
        ),
      ).toBe('ALREADY_MEMBER')
    })

    it('lets a project admin manage the members', async () => {
      // An org member who runs this project — the case that separates project
      // permissions from org ones.
      await joinProject(apollo, plain, 'admin')

      await expect(
        as(acme, plain, 'member', () =>
          projectMembers.add(apollo, admin, 'member'),
        ),
      ).resolves.toMatchObject({ userId: admin })
    })

    it('does not let a project member manage them', async () => {
      await joinProject(apollo, plain, 'member')

      // They can see the project, so this is 403 rather than 404: being told
      // "no such project" about one you are looking at reads as a bug.
      expect(
        await codeOf(
          as(acme, plain, 'member', () =>
            projectMembers.add(apollo, admin, 'member'),
          ),
        ),
      ).toBe('FORBIDDEN')
    })

    it('does not let an outsider to the project even see the list', async () => {
      // Not in the project and not running the org: 404, so the refusal does
      // not confirm the project exists.
      expect(
        await codeOf(
          as(acme, plain, 'member', () => projectMembers.list(apollo)),
        ),
      ).toBe('NOT_FOUND')
    })

    it('changes a role, and says nothing changed when it has not', async () => {
      await as(acme, owner, 'owner', () =>
        projectMembers.add(apollo, plain, 'member'),
      )

      await as(acme, owner, 'owner', () =>
        projectMembers.changeRole(apollo, plain, 'admin'),
      )

      expect(await membersOf(owner, 'owner')).toMatchObject([
        { userId: owner, role: 'admin' },
        { userId: plain, role: 'admin' },
      ])

      // Setting the role it already holds is a no-op rather than a second
      // audit row describing no change.
      await as(acme, owner, 'owner', () =>
        projectMembers.changeRole(apollo, plain, 'admin'),
      )

      expect(
        await countOf('audit.logs', `entity_type = 'project_member'`),
      ).toBe(2)
    })

    it('removes somebody outright, since the row keeps no history', async () => {
      await as(acme, owner, 'owner', () =>
        projectMembers.add(apollo, plain, 'member'),
      )
      await as(acme, owner, 'owner', () => projectMembers.remove(apollo, plain))

      expect(await membersOf(owner, 'owner')).toHaveLength(1)
      // `project.members` has no `deleted_at` — the work the person did is on
      // the tasks and stays there — so the audit row is the only record.
      expect(
        await countOf(
          'audit.logs',
          `entity_type = 'project_member' AND action = 'deleted'`,
        ),
      ).toBe(1)
    })

    it('stops seeing the project once they are removed', async () => {
      await as(acme, owner, 'owner', () =>
        projectMembers.add(apollo, plain, 'member'),
      )

      expect(
        (await as(acme, plain, 'member', () => projects.list())).map(
          (one) => one.name,
        ),
      ).toEqual(['Apollo'])

      await as(acme, owner, 'owner', () => projectMembers.remove(apollo, plain))

      expect(await as(acme, plain, 'member', () => projects.list())).toEqual([])
      expect(
        await codeOf(
          as(acme, plain, 'member', () => projects.findById(apollo)),
        ),
      ).toBe('NOT_FOUND')
    })

    it('allows a project with no admins left', async () => {
      // Deliberately no last-admin rule, unlike the organisation's last-owner
      // one: the org's owners and admins see every project, so one with nobody
      // in it is still fully administrable.
      await as(acme, owner, 'owner', () => projectMembers.remove(apollo, owner))

      expect(await membersOf(admin, 'admin')).toEqual([])
      await expect(
        as(acme, admin, 'admin', () => projects.findById(apollo)),
      ).resolves.toMatchObject({ name: 'Apollo', role: null })
    })
  })

  describe('changing one', () => {
    let apollo: string

    beforeEach(async () => {
      apollo = (await create(owner, 'owner', 'Apollo')).id
    })

    it('renames it', async () => {
      await expect(
        as(acme, owner, 'owner', () =>
          projects.update(apollo, { name: 'Apollo II' }),
        ),
      ).resolves.toMatchObject({ name: 'Apollo II' })
    })

    it('re-keys every task at once when the prefix changes', async () => {
      // Nothing to backfill: the key is composed at display time from the
      // prefix and `tasks.number`, never stored. What it costs is that a key
      // pasted into chat last week now reads differently — accepted in
      // docs/04-features/phase-1.md#task-key.
      await as(acme, owner, 'owner', () =>
        projects.update(apollo, { keyPrefix: 'OPS' }),
      )

      expect(
        await as(acme, owner, 'owner', () => projects.findById(apollo)),
      ).toMatchObject({ keyPrefix: 'OPS' })
    })

    it('writes no audit row when nothing actually changed', async () => {
      await dataSource.query(`DELETE FROM audit.logs`)

      await as(acme, owner, 'owner', () =>
        projects.update(apollo, { name: 'Apollo' }),
      )

      expect(await countOf('audit.logs')).toBe(0)
    })

    it('refuses a name another live project holds', async () => {
      await create(owner, 'owner', 'Mercury')

      expect(
        await codeOf(
          as(acme, owner, 'owner', () =>
            projects.update(apollo, { name: 'Mercury' }),
          ),
        ),
      ).toBe('NAME_TAKEN')
    })

    it('lets a project admin rename it but not an org member outside it', async () => {
      await joinProject(apollo, plain, 'admin')

      await expect(
        as(acme, plain, 'member', () =>
          projects.update(apollo, { color: 'red' }),
        ),
      ).resolves.toMatchObject({ color: 'red' })

      const mercury = (await create(owner, 'owner', 'Mercury')).id

      // Not in Mercury at all: 404, so the refusal does not confirm it exists.
      expect(
        await codeOf(
          as(acme, plain, 'member', () =>
            projects.update(mercury, { color: 'red' }),
          ),
        ),
      ).toBe('NOT_FOUND')
    })

    it('403s a project member who may see it but not change it', async () => {
      await joinProject(apollo, plain, 'member')

      expect(
        await codeOf(
          as(acme, plain, 'member', () =>
            projects.update(apollo, { color: 'red' }),
          ),
        ),
      ).toBe('FORBIDDEN')
    })
  })

  describe('archiving', () => {
    let apollo: string

    beforeEach(async () => {
      apollo = (await create(owner, 'owner', 'Apollo')).id
    })

    it('hides it from the list and lets it back', async () => {
      await as(acme, owner, 'owner', () => projects.setArchived(apollo, true))

      expect(await as(acme, owner, 'owner', () => projects.list())).toEqual([])

      await as(acme, owner, 'owner', () => projects.setArchived(apollo, false))

      expect(
        (await as(acme, owner, 'owner', () => projects.list())).map(
          (one) => one.name,
        ),
      ).toEqual(['Apollo'])
    })

    it('takes nothing away — the project still opens', async () => {
      // ⚠️ `archived_at` is not `deleted_at`. Members keep their access and the
      // history stays readable, which is why the column has no `archived_by`
      // and no CHECK pairing the two.
      await joinProject(apollo, plain, 'member')
      await as(acme, owner, 'owner', () => projects.setArchived(apollo, true))

      await expect(
        as(acme, plain, 'member', () => projects.findById(apollo)),
      ).resolves.toMatchObject({ name: 'Apollo' })
    })

    it('records its own action, not an update', async () => {
      await dataSource.query(`DELETE FROM audit.logs`)
      await as(acme, owner, 'owner', () => projects.setArchived(apollo, true))

      expect(await countOf('audit.logs', `action = 'archived'`)).toBe(1)

      // Archiving twice is a no-op rather than a second row.
      await as(acme, owner, 'owner', () => projects.setArchived(apollo, true))

      expect(await countOf('audit.logs', `action = 'archived'`)).toBe(1)
    })
  })

  describe('deleting', () => {
    let apollo: string

    beforeEach(async () => {
      apollo = (await create(owner, 'owner', 'Apollo')).id
    })

    it('takes the statuses down with it', async () => {
      // `ON DELETE CASCADE` fires only on a hard delete, so without the
      // cascade the statuses outlive the project — and `tasks.project_id` is
      // RESTRICT, which jams the retention purge ninety days later.
      await as(acme, owner, 'owner', () => projects.remove(apollo))

      expect(await countOf('project.statuses', 'deleted_at IS NULL')).toBe(0)
      expect(await countOf('project.projects', 'deleted_at IS NULL')).toBe(0)
    })

    it('writes the audit row in the same transaction as the cascade', async () => {
      await dataSource.query(`DELETE FROM audit.logs`)
      await as(acme, owner, 'owner', () => projects.remove(apollo))

      const [entry] = (await dataSource.query(
        `SELECT action, changes_json FROM audit.logs WHERE entity_type = 'project'`,
      )) as { action: string; changes_json: Record<string, unknown> }[]

      expect(entry?.action).toBe('deleted')
      // What went with it, so the log answers "and the statuses?" without
      // anybody having to reason about the cascade map.
      expect(entry?.changes_json).toMatchObject({
        cascaded: { to: { 'project.projects': 1, 'project.statuses': 4 } },
      })
    })

    it('releases the name, since the unique index is partial', async () => {
      await as(acme, owner, 'owner', () => projects.remove(apollo))

      await expect(create(owner, 'owner', 'Apollo')).resolves.toMatchObject({
        name: 'Apollo',
      })
    })

    it('is gone from the list and from findById', async () => {
      await as(acme, owner, 'owner', () => projects.remove(apollo))

      expect(await as(acme, owner, 'owner', () => projects.list())).toEqual([])
      expect(
        await codeOf(as(acme, owner, 'owner', () => projects.findById(apollo))),
      ).toBe('NOT_FOUND')
    })

    it('refuses a project member, and a project admin may', async () => {
      await joinProject(apollo, plain, 'member')

      expect(
        await codeOf(as(acme, plain, 'member', () => projects.remove(apollo))),
      ).toBe('FORBIDDEN')

      await dataSource.query(
        `UPDATE project.members SET role = 'admin' WHERE user_id = $1`,
        [plain],
      )

      await expect(
        as(acme, plain, 'member', () => projects.remove(apollo)),
      ).resolves.toBeUndefined()
    })
  })
})
