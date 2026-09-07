import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { OrgRole } from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { createOrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { runWithRequestContext } from '#shared/org-scope/request-context'
import { SYSTEM_USER_ID } from '#shared/system-user'

import { AuditService } from '../src/modules/audit/audit.service'
import { AuditLog } from '../src/modules/audit/log.entity'
import { OrganizationMember } from '../src/modules/organization/member.entity'
import { MemberService } from '../src/modules/organization/member.service'
import { Organization } from '../src/modules/organization/organization.entity'
import { OrganizationService } from '../src/modules/organization/organization.service'
import { PermissionService } from '../src/permission/permission.service'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

/**
 * 🔒 An organisation always has an owner, and nothing anybody can do through
 * this API leaves it without one.
 *
 * The rule has no database constraint behind it — "at least one row in this
 * group has role = 'owner'" is not something a CHECK can say — so this suite
 * is the whole enforcement, alongside the condition inside the UPDATE that it
 * exercises.
 */
describe.skipIf(!hasTestDatabase)('organization', () => {
  let dataSource: DataSource
  let members: MemberService
  let organizations: OrganizationService
  let acme: string
  let owner: string
  let secondOwner: string
  let admin: string
  let plain: string

  /** A request, as the guard would have set it up. */
  const asMember = <R>(
    orgId: string | null,
    userId: string,
    orgRole: OrgRole | null,
    fn: () => R,
  ): R => runWithRequestContext({ orgId, userId, orgRole, sessionId: null }, fn)

  // `username` is CHECKed as a-z0-9_ — a hyphen here fails at the database
  // rather than in anything this suite is about.
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

  const join = (orgId: string, userId: string, role: OrgRole) =>
    dataSource.query(
      `INSERT INTO organization.members
         (org_id, user_id, role, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)`,
      [orgId, userId, role, SYSTEM_USER_ID],
    )

  const roleOf = async (orgId: string, userId: string): Promise<string> => {
    const [row] = (await dataSource.query(
      `SELECT role FROM organization.members
        WHERE org_id = $1 AND user_id = $2`,
      [orgId, userId],
    )) as { role: string }[]

    return row?.role ?? 'gone'
  }

  const ownerCount = async (orgId: string): Promise<number> => {
    const [row] = (await dataSource.query(
      `SELECT count(*)::int AS n FROM organization.members
        WHERE org_id = $1 AND role = 'owner'`,
      [orgId],
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

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()

    const audit = new AuditService(
      createOrgScopedRepository(dataSource, AuditLog),
    )
    members = new MemberService(
      createOrgScopedRepository(dataSource, OrganizationMember),
      dataSource,
      new PermissionService(),
      audit,
    )
    organizations = new OrganizationService(
      createOrgScopedRepository(dataSource, Organization, 'id'),
      dataSource,
      audit,
    )

    owner = await newUser('owner')
    secondOwner = await newUser('second_owner')
    admin = await newUser('admin')
    plain = await newUser('plain')
  }, 60_000)

  afterAll(async () => {
    await dataSource?.destroy()
  })

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM audit.logs`)
    await dataSource.query(`DELETE FROM organization.members`)
    await dataSource.query(`DELETE FROM organization.organizations`)

    acme = (
      await asMember(null, owner, null, () =>
        organizations.create({ name: 'Acme', slug: 'acme' }),
      )
    ).id
  })

  describe('creating', () => {
    it('makes the creator the owner, in the same transaction', async () => {
      // An organisation whose owner row failed to insert is exactly the state
      // the last-owner rule exists to prevent, reachable on the first request.
      expect(await roleOf(acme, owner)).toBe('owner')
      expect(await ownerCount(acme)).toBe(1)
    })

    it('records the creation against the org that now exists', async () => {
      // The caller had no org when they asked, so the audit row cannot take
      // `org_id` from the request context as every other write does.
      const [entry] = (await dataSource.query(
        `SELECT org_id, entity_type, action FROM audit.logs`,
      )) as { org_id: string; entity_type: string; action: string }[]

      expect(entry).toEqual({
        org_id: acme,
        entity_type: 'organization',
        action: 'created',
      })
    })

    it('refuses a slug another live organisation holds', async () => {
      expect(
        await codeOf(
          asMember(null, plain, null, () =>
            organizations.create({ name: 'Acme Two', slug: 'acme' }),
          ),
        ),
      ).toBe('SLUG_TAKEN')
    })

    it('leaves nothing behind when the slug is taken', async () => {
      // The org insert fails, so the member insert never runs — but a
      // half-committed create would show up here as an extra organisation.
      await codeOf(
        asMember(null, plain, null, () =>
          organizations.create({ name: 'Acme Two', slug: 'acme' }),
        ),
      )

      const [row] = (await dataSource.query(
        `SELECT count(*)::int AS n FROM organization.organizations`,
      )) as { n: number }[]

      expect(row!.n).toBe(1)
    })
  })

  describe('the last owner', () => {
    it('refuses to demote the only one', async () => {
      expect(
        await codeOf(
          asMember(acme, owner, 'owner', () =>
            members.changeRole(owner, 'admin'),
          ),
        ),
      ).toBe('LAST_OWNER')

      expect(await roleOf(acme, owner)).toBe('owner')
    })

    it('allows it once there is a second', async () => {
      await join(acme, secondOwner, 'owner')

      await asMember(acme, owner, 'owner', () =>
        members.changeRole(owner, 'admin'),
      )

      expect(await roleOf(acme, owner)).toBe('admin')
      expect(await ownerCount(acme)).toBe(1)
    })

    it('🔒 keeps one when two owners are demoted at the same moment', async () => {
      // The case a `SELECT count(*)` before the write cannot survive: both
      // statements read "there are two owners", both decide the change is
      // safe, and the organisation ends with none — administrable by nobody,
      // with no error raised and no way back short of an UPDATE on
      // production. The condition lives inside the UPDATE, so Postgres
      // serialises the two on the row and the loser matches nothing.
      await join(acme, secondOwner, 'owner')

      const outcomes = await Promise.allSettled([
        asMember(acme, owner, 'owner', () =>
          members.changeRole(owner, 'member'),
        ),
        asMember(acme, secondOwner, 'owner', () =>
          members.changeRole(secondOwner, 'member'),
        ),
      ])

      expect(await ownerCount(acme)).toBe(1)
      expect(outcomes.filter((one) => one.status === 'fulfilled')).toHaveLength(
        1,
      )
    })

    it('lets the last owner be replaced by promoting first', async () => {
      // The way out the error message points at, and it has to work: promote
      // somebody, then step down.
      await join(acme, admin, 'admin')

      await asMember(acme, owner, 'owner', () =>
        members.changeRole(admin, 'owner'),
      )
      await asMember(acme, owner, 'owner', () =>
        members.changeRole(owner, 'member'),
      )

      expect(await roleOf(acme, admin)).toBe('owner')
      expect(await roleOf(acme, owner)).toBe('member')
    })
  })

  describe('who may change a role', () => {
    beforeEach(async () => {
      await join(acme, admin, 'admin')
      await join(acme, plain, 'member')
    })

    it('lets an admin promote a member to admin', async () => {
      await asMember(acme, admin, 'admin', () =>
        members.changeRole(plain, 'admin'),
      )

      expect(await roleOf(acme, plain)).toBe('admin')
    })

    it('refuses an admin the power to appoint an owner', async () => {
      expect(
        await codeOf(
          asMember(acme, admin, 'admin', () =>
            members.changeRole(plain, 'owner'),
          ),
        ),
      ).toBe('FORBIDDEN')

      expect(await roleOf(acme, plain)).toBe('member')
    })

    it('refuses an admin the power to demote one', async () => {
      // Both directions are needed. An admin stopped only from promoting
      // could still demote every owner, leaving nobody able to promote back.
      expect(
        await codeOf(
          asMember(acme, admin, 'admin', () =>
            members.changeRole(owner, 'member'),
          ),
        ),
      ).toBe('FORBIDDEN')

      expect(await roleOf(acme, owner)).toBe('owner')
    })

    it('refuses an ordinary member outright', async () => {
      expect(
        await codeOf(
          asMember(acme, plain, 'member', () =>
            members.changeRole(admin, 'member'),
          ),
        ),
      ).toBe('FORBIDDEN')
    })

    it('answers "not found" for somebody in another organisation', async () => {
      const other = await asMember(null, plain, null, () =>
        organizations.create({ name: 'Globex', slug: 'globex' }),
      )

      // 404 rather than 403: from this org's side they simply are not here,
      // and a different answer would confirm the account exists.
      expect(
        await codeOf(
          asMember(acme, owner, 'owner', () =>
            members.changeRole(SYSTEM_USER_ID, 'admin'),
          ),
        ),
      ).toBe('NOT_FOUND')

      expect(await roleOf(other.id, plain)).toBe('owner')
    })
  })

  describe('editing the organisation', () => {
    it('renames it and records what changed', async () => {
      await asMember(acme, owner, 'owner', () =>
        organizations.update({ name: 'Acme Corp' }),
      )

      const [entry] = (await dataSource.query(
        `SELECT changes_json FROM audit.logs WHERE action = 'updated'`,
      )) as { changes_json: Record<string, unknown> }[]

      expect(entry!.changes_json).toEqual({
        name: { from: 'Acme', to: 'Acme Corp' },
      })
    })

    it('writes no audit row for a patch that changes nothing', async () => {
      await asMember(acme, owner, 'owner', () =>
        organizations.update({ name: 'Acme' }),
      )

      const [row] = (await dataSource.query(
        `SELECT count(*)::int AS n FROM audit.logs WHERE action = 'updated'`,
      )) as { n: number }[]

      expect(row!.n).toBe(0)
    })

    it('refuses a slug another organisation holds', async () => {
      await asMember(null, plain, null, () =>
        organizations.create({ name: 'Globex', slug: 'globex' }),
      )

      expect(
        await codeOf(
          asMember(acme, owner, 'owner', () =>
            organizations.update({ slug: 'globex' }),
          ),
        ),
      ).toBe('SLUG_TAKEN')
    })

    it('🔒 cannot rename another organisation', async () => {
      const globex = await asMember(null, plain, null, () =>
        organizations.create({ name: 'Globex', slug: 'globex' }),
      )

      await asMember(acme, owner, 'owner', () =>
        organizations.update({ name: 'Renamed' }),
      )

      const [row] = (await dataSource.query(
        `SELECT name FROM organization.organizations WHERE id = $1`,
        [globex.id],
      )) as { name: string }[]

      expect(row!.name).toBe('Globex')
    })
  })
})
