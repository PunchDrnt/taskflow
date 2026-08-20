import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Organization } from '../src/modules/organization/organization.entity'
import { Project } from '../src/modules/project/project.entity'
import { OrgScopedRepository } from '../src/shared/org-scoped.repository'
import { runWithRequestContext } from '../src/shared/request-context'
import { SYSTEM_USER_ID } from '../src/shared/system-user'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

/**
 * 🔒 The test with no exceptions: a query made on behalf of one organisation
 * must never return another's rows.
 *
 * This is the whole reason `org_id` is on every table and `OrgScopedRepository`
 * exists. It runs against a real Postgres rather than a mock, because what is
 * being tested is the SQL that actually reaches the database.
 *
 * See .claude/docs/02-database.md#3-multi-tenancy
 */

describe.skipIf(!hasTestDatabase)('cross-org isolation', () => {
  let dataSource: DataSource
  let orgA: Organization
  let orgB: Organization
  let projects: OrgScopedRepository<Project>
  let organizations: OrgScopedRepository<Organization>

  const asOrg = <R>(org: Organization, fn: () => R): R =>
    runWithRequestContext({ orgId: org.id, userId: SYSTEM_USER_ID }, fn)

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()

    projects = new OrgScopedRepository(dataSource.getRepository(Project))
    // The one table scoped on `id`: it has no org_id of its own.
    organizations = new OrgScopedRepository(
      dataSource.getRepository(Organization),
      'id',
    )

    const rawOrgs = dataSource.getRepository(Organization)
    orgA = await rawOrgs.save(
      rawOrgs.create({
        name: 'Org A',
        slug: 'org-a',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      }),
    )
    orgB = await rawOrgs.save(
      rawOrgs.create({
        name: 'Org B',
        slug: 'org-b',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      }),
    )

    await asOrg(orgA, () =>
      projects.save(projects.create({ name: "A's project" })),
    )
    await asOrg(orgB, () =>
      projects.save(projects.create({ name: "B's project" })),
    )
  }, 60_000)

  afterAll(async () => {
    await dataSource?.destroy()
  })

  it('find returns only the current org rows', async () => {
    const fromA = await asOrg(orgA, () => projects.find())
    const fromB = await asOrg(orgB, () => projects.find())

    expect(fromA.map((project) => project.name)).toEqual(["A's project"])
    expect(fromB.map((project) => project.name)).toEqual(["B's project"])
  })

  it('a where clause narrows, it does not replace the org condition', async () => {
    const found = await asOrg(orgA, () =>
      projects.find({ where: { name: "B's project" } }),
    )

    expect(found).toEqual([])
  })

  it('an OR condition gets the org into every branch', async () => {
    // TypeORM reads an array as OR. Adding the org once beside the array
    // would widen the query rather than narrow it.
    const found = await asOrg(orgA, () =>
      projects.find({
        where: [{ name: "A's project" }, { name: "B's project" }],
      }),
    )

    expect(found.map((project) => project.name)).toEqual(["A's project"])
  })

  it('findById cannot reach across orgs', async () => {
    const bProject = await asOrg(orgB, () => projects.find())
    const id = bProject[0]!.id

    expect(await asOrg(orgB, () => projects.findById(id))).not.toBeNull()
    expect(await asOrg(orgA, () => projects.findById(id))).toBeNull()
  })

  it('count and exists are scoped too', async () => {
    expect(await asOrg(orgA, () => projects.count())).toBe(1)
    expect(
      await asOrg(orgA, () =>
        projects.exists({ where: { name: "B's project" } }),
      ),
    ).toBe(false)
  })

  it('the query builder starts scoped', async () => {
    const rows = await asOrg(orgA, () =>
      projects.queryBuilder.withOrg('project').getMany(),
    )

    expect(rows.map((project) => project.name)).toEqual(["A's project"])
  })

  it('create stamps the current org, ignoring any org passed in', async () => {
    const project = asOrg(orgA, () =>
      projects.create({ name: 'attempted', orgId: orgB.id }),
    )

    expect(project.orgId).toBe(orgA.id)
  })

  it('soft delete cannot reach another org, and reports nothing deleted', async () => {
    const bProject = (await asOrg(orgB, () => projects.find()))[0]!

    expect(await asOrg(orgA, () => projects.softDeleteById(bProject.id))).toBe(
      0,
    )
    expect(
      await asOrg(orgB, () => projects.findById(bProject.id)),
    ).not.toBeNull()
  })

  it('scopes organizations on id, since that table has no org_id', async () => {
    const fromA = await asOrg(orgA, () => organizations.find())

    expect(fromA.map((org) => org.slug)).toEqual(['org-a'])
  })

  it('does not answer a different question when asked for another org by id', async () => {
    // Scoping used to overwrite the caller's id, so this returned org A.
    expect(await asOrg(orgA, () => organizations.findById(orgB.id))).toBeNull()
  })

  it('returns nothing when the where clause names another org outright', async () => {
    expect(
      await asOrg(orgA, () => projects.find({ where: { orgId: orgB.id } })),
    ).toEqual([])
  })

  it('does not force id = orgId when creating on the id-scoped repository', () => {
    const created = asOrg(orgA, () =>
      organizations.create({ name: 'new', slug: 'new-org' }),
    )

    // Forcing it would make every new organisation collide with its creator's.
    expect(created.id).toBeUndefined()
  })

  it('soft delete writes deletedBy, not just deletedAt', async () => {
    const project = await asOrg(orgA, () =>
      projects.save(projects.create({ name: 'to delete' })),
    )
    await asOrg(orgA, () => projects.softDeleteById(project.id))

    const [row] = (await dataSource.query(
      'SELECT deleted_at, deleted_by FROM project.projects WHERE id = $1',
      [project.id],
    )) as { deleted_at: Date | null; deleted_by: string | null }[]

    // A CHECK on every soft-deletable table rejects one without the other,
    // and TypeORM's softDelete() runs no subscriber to fill it in.
    expect(row?.deleted_by).toBe(SYSTEM_USER_ID)
    expect(row?.deleted_at).not.toBeNull()
  })

  it('hides a soft-deleted row from subsequent reads', async () => {
    const project = await asOrg(orgA, () =>
      projects.save(projects.create({ name: 'disappearing' })),
    )

    expect(
      await asOrg(orgA, () => projects.findById(project.id)),
    ).not.toBeNull()
    await asOrg(orgA, () => projects.softDeleteById(project.id))

    // @DeleteDateColumn makes TypeORM add "deleted_at IS NULL" to reads, but
    // softDeleteById sets the column through update() rather than softDelete(),
    // so it is worth proving the two still agree.
    expect(await asOrg(orgA, () => projects.findById(project.id))).toBeNull()
    expect(
      (await asOrg(orgA, () => projects.find())).map((p) => p.name),
    ).not.toContain('disappearing')
  })

  it('fills createdBy from the context when the caller omits it', async () => {
    const project = await asOrg(orgA, () =>
      projects.save(projects.create({ name: 'unattributed' })),
    )

    expect(project.createdBy).toBe(SYSTEM_USER_ID)
    expect(project.updatedBy).toBe(SYSTEM_USER_ID)
  })

  it('rejects .where() on the scoped builder, at every hop of a chain', async () => {
    await asOrg(orgA, () => {
      const builder = projects.queryBuilder.withOrg('project')

      // The type omits it; this is the runtime half, which is what still
      // holds after andWhere returns `this` and TypeScript stops helping.
      expect(() =>
        (builder as unknown as { where: (c: string) => unknown }).where(
          '1 = 1',
        ),
      ).toThrow(/would drop the organisation condition/)

      const chained = builder.andWhere('project.name IS NOT NULL')
      expect(() =>
        (chained as unknown as { where: (c: string) => unknown }).where(
          '1 = 1',
        ),
      ).toThrow(/would drop the organisation condition/)

      expect(() =>
        (chained as unknown as { orWhere: (c: string) => unknown }).orWhere(
          '1 = 1',
        ),
      ).toThrow(/would drop the organisation condition/)
    })
  })

  it('still runs a normal chained query through the guard', async () => {
    const rows = await asOrg(orgA, () =>
      projects.queryBuilder
        .withOrg('project')
        .andWhere('project.name IS NOT NULL')
        .orderBy('project.name', 'ASC')
        .getMany(),
    )

    expect(rows.every((project) => project.orgId === orgA.id)).toBe(true)
  })

  it('base() is the only way across orgs on an org-scoped table', async () => {
    const all = await asOrg(orgA, () =>
      projects.queryBuilder.base('project').getMany(),
    )

    const orgIds = new Set(all.map((project) => project.orgId))
    expect(orgIds.size).toBeGreaterThan(1)
  })

  it('refuses to query at all with no request context', () => {
    // Synchronously, at the call site — not as a rejected promise somewhere
    // later, and never as an unscoped query that quietly returns everything.
    expect(() => projects.find()).toThrow(/No request context/)
  })
})
