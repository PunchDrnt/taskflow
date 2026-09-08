import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import {
  ORGANIZATION_ERROR_CODES,
  type AddOrgMemberInput,
  type OrgRole,
} from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { requireOrgContext } from '#shared/org-scope/request-context'

import { actorFromContext } from '../../permission/actor'
import { PermissionService } from '../../permission/permission.service'
import { AuditService } from '../audit/audit.service'
import { PasswordService } from '../iam/auth/password.service'
import { ACTIVE_USER_STATUS, UserService } from '../iam/user/user.service'
import { OrganizationMember } from './member.entity'
import { MembershipService } from './membership.service'

/** One row of the members list, before names are attached. */
export interface OrgMember {
  userId: string
  role: OrgRole
  /** `created_at` under the name it has on this screen. */
  joinedAt: Date
  /**
   * `iam.users.status`. A deactivated colleague stays in this list — the
   * specification is explicit that they do — so the screen needs to be able
   * to say which ones can no longer sign in.
   */
  status?: string
}

/**
 * The people in the organisation this request is acting for.
 *
 * Distinct from `MembershipService`, which answers the opposite question —
 * "which orgs is this person in" — and is the one query in the codebase that
 * crosses orgs on purpose. Everything here stays inside one.
 */
@Injectable()
export class MemberService {
  constructor(
    @InjectOrgRepository(OrganizationMember)
    private readonly members: OrgScopedRepository<OrganizationMember>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    private readonly users: UserService,
    private readonly passwords: PasswordService,
    private readonly memberships: MembershipService,
  ) {}

  list(): Promise<OrgMember[]> {
    return this.members.queryBuilder
      .withOrg('member')
      .select('member.user_id', 'userId')
      .addSelect('member.role', 'role')
      .addSelect('member.created_at', 'joinedAt')
      .orderBy('member.created_at', 'ASC')
      .getRawMany<OrgMember>()
  }

  findByUserId(userId: string): Promise<OrganizationMember | null> {
    return this.members.queryBuilder
      .withOrg('member')
      .andWhere('member.userId = :userId', { userId })
      .getOne()
  }

  /**
   * Creates an account and puts it in this organisation, in one transaction.
   *
   * Phase 1's way of adding people. `organization.invitations` is migrated and
   * unread until Phase 2, so until then somebody with the rights types the
   * details in — which is what the checklist means by "a seed script or an
   * admin API", chosen as the API because it is auditable and does not need
   * shell access to production.
   *
   * If the address already has an account, that account is joined to this
   * organisation instead of a second one being made: one person, several
   * companies, is the case this system has from Phase 1.
   *
   * The password is set rather than emailed. The reset flow already exists and
   * is the safe way to hand one over; inventing a second invitation mechanism
   * here is what Phase 2 is for.
   */
  async add(input: AddOrgMemberInput): Promise<OrgMember> {
    const { orgId, userId: actorId } = requireOrgContext()

    // The same rule as changing a role: an admin runs the org's people, but
    // may not create an owner. `id` is absent because no row exists yet.
    this.permissions.assert(actorFromContext(), 'update', 'Member', {
      newRole: input.role,
    })

    const existing = await this.users.findByEmail(input.email)

    if (existing && (await this.findByUserId(existing.id))) {
      throw new ApiException(
        409,
        ORGANIZATION_ERROR_CODES.ACCOUNT_EXISTS,
        'That person is already in this organisation',
      )
    }

    const user =
      existing ??
      (await this.users.create({
        email: input.email,
        username: input.username,
        name: input.name,
        nickname: input.nickname,
        passwordHash: await this.passwords.hash(input.password),
      }))

    return this.dataSource.transaction(async (manager) => {
      const inserted = await manager.insert(OrganizationMember, {
        orgId,
        userId: user.id,
        role: input.role,
        createdBy: actorId,
        updatedBy: actorId,
      })

      const member = inserted.generatedMaps[0] as OrganizationMember

      await this.audit.record(manager, {
        entityType: 'member',
        entityId: member.id,
        action: 'created',
        changes: {
          userId: { from: null, to: user.id },
          role: { from: null, to: input.role },
          // Says whether this created an account or attached one that already
          // existed, which is the question somebody reading the log will have.
          accountCreated: { from: null, to: existing === null },
        },
      })

      return {
        userId: user.id,
        role: input.role,
        joinedAt: member.createdAt ?? new Date(),
        status: user.status,
      }
    })
  }

  /**
   * Switches a colleague's account off, or back on.
   *
   * docs/04-features/phase-1.md#user-states--three-different-things: they stay
   * in this list, their finished work keeps their name, and **the tasks they
   * are holding stay with them** — switching an account off is not a decision
   * about who does the work, and making it one silently would be the system
   * reassigning things nobody asked it to.
   *
   * 🔒 **Refused when the account belongs to more than one organisation.**
   * `iam.users.status` is account-level: one company's admin flipping it would
   * lock the person out of every other company they work with. The
   * specification never contemplated that — its own example routes the shared
   * account to "remove them from the organisation", which is Phase 2 — and a
   * cross-org effect is the one kind of mistake this codebase treats as
   * binding. Refusing is the honest answer until removal exists.
   */
  async setActive(userId: string, active: boolean): Promise<OrgMember> {
    const { userId: actorId } = requireOrgContext()

    const member = await this.findByUserId(userId)

    if (!member)
      throw ApiException.notFound('No such member in this organisation')

    // An admin may not touch an owner: `newRole` repeats the current role so
    // only that rule can fire, not the one about creating owners.
    this.permissions.assert(actorFromContext(), 'update', 'Member', {
      id: member.id,
      userId: member.userId,
      role: member.role as OrgRole,
      newRole: member.role as OrgRole,
    })

    const user = await this.users.findById(userId)

    if (!user)
      throw ApiException.notFound('No such member in this organisation')

    const next = active ? ACTIVE_USER_STATUS : 'deactivated'

    if (user.status === next) {
      return {
        userId,
        role: member.role as OrgRole,
        joinedAt: member.createdAt,
        status: user.status,
      }
    }

    if (!active) {
      await this.refuseIfShared(userId)
      await this.refuseIfLastOwner(member)
    }

    await this.dataSource.transaction(async (manager) => {
      await this.users.setStatus(userId, next, actorId)

      await this.audit.record(manager, {
        entityType: 'member',
        entityId: member.id,
        action: active ? 'reactivated' : 'deactivated',
        changes: { status: { from: user.status, to: next } },
      })
    })

    return {
      userId,
      role: member.role as OrgRole,
      joinedAt: member.createdAt,
      status: next,
    }
  }

  /** 🔒 See `setActive` — the account is not this organisation's alone. */
  private async refuseIfShared(userId: string): Promise<void> {
    const orgs = await this.memberships.listForUser(userId)

    if (orgs.length <= 1) return

    throw new ApiException(
      409,
      ORGANIZATION_ERROR_CODES.USER_IN_OTHER_ORGS,
      'This account also belongs to another organisation, and deactivating ' +
        'it would lock them out of that one too. Remove them from this ' +
        'organisation instead (Phase 2).',
      { organizations: orgs.length },
    )
  }

  /**
   * An organisation whose only owner cannot sign in is one nobody can
   * administer — the same hole the last-owner rule on `changeRole` closes,
   * reached by a different door.
   */
  private async refuseIfLastOwner(member: OrganizationMember): Promise<void> {
    if (member.role !== 'owner') return

    const owners = await this.members.queryBuilder
      .withOrg('member')
      .andWhere("member.role = 'owner'")
      .andWhere('member.userId != :userId', { userId: member.userId })
      .getCount()

    if (owners > 0) return

    throw new ApiException(
      409,
      ORGANIZATION_ERROR_CODES.LAST_OWNER,
      'The last owner cannot be deactivated. Appoint another owner first.',
    )
  }

  /**
   * Changes what somebody is in this organisation.
   *
   * The permission check lives here rather than in the controller because it
   * needs the row: whether an admin may make this change depends on what the
   * target is now and what they would become, and neither is known before the
   * load. `@RequirePermission` deliberately cannot express it — see the
   * decorator's `ContextResolvedSubject`.
   *
   * 🔒 **The last-owner rule is a condition inside the `UPDATE`, never a count
   * read beforehand.** Two admins demoting the two remaining owners at the
   * same moment would both read "there are two owners", both decide the change
   * is safe, and both commit — leaving an organisation nobody can administer,
   * with no error and no way back short of a manual `UPDATE` on production.
   * Postgres serialises the two statements on the row instead, and the loser's
   * `EXISTS` no longer holds, so it matches nothing and is refused.
   *
   * The same shape as `SessionService.rotate` and `OutboxWorker.claim`, and
   * the same lesson: read-then-write is not a check, it is a race that usually
   * happens to be won.
   */
  async changeRole(userId: string, next: OrgRole): Promise<OrgMember> {
    const { orgId, userId: actorId } = requireOrgContext()

    const member = await this.findByUserId(userId)

    // Not "forbidden": from this org's side the person simply is not here, and
    // saying otherwise would confirm that an account exists.
    if (!member)
      throw ApiException.notFound('No such member in this organisation')

    this.permissions.assert(actorFromContext(), 'update', 'Member', {
      id: member.id,
      userId: member.userId,
      // What it is now, and what is being asked for. `ability.ts` reads both:
      // an admin may not touch an owner, and may not create one.
      role: member.role as OrgRole,
      newRole: next,
    })

    if (member.role === next) {
      return {
        userId: member.userId,
        role: next,
        joinedAt: member.createdAt,
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(OrganizationMember)
        .set({ role: next, updatedAt: new Date(), updatedBy: actorId })
        .where('id = :id', { id: member.id })
        // The org comes from the context, never from the caller — the same
        // rule every scoped query follows. This is a raw builder rather than
        // `withOrg` because that one seals a *select*, and an update needs to
        // run on the transaction's own manager.
        .andWhere('org_id = :orgId', { orgId })
        .andWhere(
          `(
             :next = 'owner'
             OR role <> 'owner'
             OR EXISTS (
               SELECT 1
                 FROM organization.members other
                WHERE other.org_id = :orgId
                  AND other.role = 'owner'
                  AND other.id <> :id
             )
           )`,
          { next },
        )
        .returning(['id'])
        .execute()

      // Empty RETURNING means the guard clause above did not hold. The row
      // exists — it was loaded a moment ago and nothing in Phase 1 deletes a
      // membership — so the only way to match nothing is to be the org's last
      // owner.
      if ((result.raw as { id: string }[]).length === 0) {
        throw new ApiException(
          403,
          ORGANIZATION_ERROR_CODES.LAST_OWNER,
          'An organisation must keep at least one owner. Appoint another owner first.',
        )
      }

      await this.audit.record(manager, {
        entityType: 'org_member',
        entityId: member.id,
        action: 'updated',
        changes: { role: { from: member.role, to: next } },
      })
    })

    return { userId: member.userId, role: next, joinedAt: member.createdAt }
  }
}
