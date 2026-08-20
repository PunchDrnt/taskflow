import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Organization } from '../src/modules/organization/organization.entity'
import { Project } from '../src/modules/project/project.entity'
import { OrgScopedRepository } from '../src/shared/org-scoped.repository'
import { runWithRequestContext } from '../src/shared/request-context'
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

const SYSTEM_USER = '00000000-0000-0000-0000-000000000000'

describe.skipIf(!hasTestDatabase)('cross-org isolation', () => {
  let dataSource: DataSource
  let orgA: Organization
  let orgB: Organization
  let projects: OrgScopedRepository<Project>
  let organizations: OrgScopedRepository<Organization>

  const asOrg = <R>(org: Organization, fn: () => R): R =>
    runWithRequestContext({ orgId: org.id, userId: SYSTEM_USER }, fn)

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
        createdBy: SYSTEM_USER,
        updatedBy: SYSTEM_USER,
      }),
    )
    orgB = await rawOrgs.save(
      rawOrgs.create({
        name: 'Org B',
        slug: 'org-b',
        createdBy: SYSTEM_USER,
        updatedBy: SYSTEM_USER,
      }),
    )

    await asOrg(orgA, () =>
      projects.save(
        projects.create({
          name: "A's project",
          createdBy: SYSTEM_USER,
          updatedBy: SYSTEM_USER,
        }),
      ),
    )
    await asOrg(orgB, () =>
      projects.save(
        projects.create({
          name: "B's project",
          createdBy: SYSTEM_USER,
          updatedBy: SYSTEM_USER,
        }),
      ),
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
      projects.createQueryBuilder('project').getMany(),
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

  it('refuses to query at all with no request context', () => {
    // Synchronously, at the call site — not as a rejected promise somewhere
    // later, and never as an unscoped query that quietly returns everything.
    expect(() => projects.find()).toThrow(/No request context/)
  })
})
