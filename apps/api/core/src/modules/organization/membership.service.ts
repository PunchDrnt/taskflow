import { Injectable } from '@nestjs/common'

import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'

import { OrganizationMember } from './member.entity'
import { Organization } from './organization.entity'

/** One organisation a person may act for, with what the picker needs to draw it. */
export interface Membership {
  orgId: string
  name: string
  slug: string
  /** 'owner' | 'admin' | 'member' — their role in *this* org. */
  role: string
}

/** What `resolveActiveOrg` decided, and whether a stale cookie must go. */
export interface ActiveOrg {
  orgId: string | null
  /**
   * True when the cookie named an org they cannot use. Clearing it is not
   * tidiness: a choice that no longer holds would 403 every request until
   * somebody cleared their browser by hand.
   */
  clearCookie: boolean
}

/**
 * Which organisations a person may act for.
 *
 * Lives here rather than in `identity/user/` — the plan's first home for it —
 * because `organization.members` and `organization.organizations` are this
 * module's tables, and moving the query into identity would mean identity
 * importing two entities it does not own. The question is about a user; the
 * answer is entirely in organization's rows.
 */
@Injectable()
export class MembershipService {
  constructor(
    @InjectOrgRepository(OrganizationMember)
    private readonly members: OrgScopedRepository<OrganizationMember>,
  ) {}

  /**
   * `base`, not `withOrg` — the deliberate crossing CLAUDE.md asks for a
   * stated reason for, and this is the one query where the reason is the
   * question itself: "which orgs is this person in" cannot be scoped to one
   * org without assuming its own answer. It also runs before any org is
   * chosen, so there would be nothing to scope by.
   *
   * Nothing else here may cross. Called once per session-cache fill rather
   * than per request.
   */
  async listForUser(userId: string): Promise<Membership[]> {
    const rows = await this.members.queryBuilder
      .base('member')
      .innerJoin(Organization, 'org', 'org.id = member.org_id')
      .select('member.org_id', 'orgId')
      .addSelect('member.role', 'role')
      .addSelect('org.name', 'name')
      .addSelect('org.slug', 'slug')
      .where('member.user_id = :userId', { userId })
      .andWhere('org.deleted_at IS NULL')
      .orderBy('org.name', 'ASC')
      .getRawMany<Membership>()

    return rows
  }
}

/**
 * Which org *this request* is for: exactly one, or none.
 *
 * The cookie is a **choice, never a permission** — it is checked against the
 * memberships the database just returned, so editing it buys a 403 and nothing
 * else. That is why it needs no signature of its own.
 *
 * A pure function rather than a method: it is the part with six cases and no
 * database, so it is the part worth testing exhaustively.
 * docs/01-architecture.md#org-ไหนของ-request-นี้ has the table it implements.
 */
export function resolveActiveOrg(
  memberships: Membership[],
  cookie: string | undefined,
): ActiveOrg {
  if (cookie !== undefined && cookie !== '') {
    const chosen = memberships.find((membership) => membership.orgId === cookie)

    if (chosen) return { orgId: chosen.orgId, clearCookie: false }

    // Named an org they are not in, or were removed from. Not an error here —
    // the guard decides what to answer — but the cookie must not survive it.
    return { orgId: null, clearCookie: true }
  }

  // Exactly one is not a choice, so nobody is asked to make it.
  if (memberships.length === 1) {
    return { orgId: memberships[0]!.orgId, clearCookie: false }
  }

  // Several and unchosen, or none at all. Both are null here and separate
  // error codes at the guard, because they need different screens.
  return { orgId: null, clearCookie: false }
}
