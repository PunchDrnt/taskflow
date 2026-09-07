import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { ORGANIZATION_ERROR_CODES, type OrgRole } from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { requireOrgContext } from '#shared/org-scope/request-context'

import { actorFromContext } from '../../permission/actor'
import { PermissionService } from '../../permission/permission.service'
import { AuditService } from '../audit/audit.service'
import { OrganizationMember } from './member.entity'

/** One row of the members list, before names are attached. */
export interface OrgMember {
  userId: string
  role: OrgRole
  /** `created_at` under the name it has on this screen. */
  joinedAt: Date
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
    if (!member) throw ApiException.notFound('ไม่พบสมาชิกนี้ในองค์กร')

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
          'องค์กรต้องมีเจ้าของอย่างน้อยหนึ่งคน กรุณาตั้งเจ้าของคนใหม่ก่อน',
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
