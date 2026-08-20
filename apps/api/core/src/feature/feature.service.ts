import { Injectable } from '@nestjs/common'

/**
 * Everything a plan could gate. Listed here rather than as free strings so a
 * typo is a compile error instead of a silently-open feature.
 */
export const FEATURES = ['public_registration'] as const
export type Feature = (typeof FEATURES)[number]

/**
 * `can(org, feature)` — always true, on purpose.
 *
 * Nothing is gated until Phase 7 turns this into a plan lookup. It exists now
 * because retrofitting it means editing every controller at once, which is the
 * same argument as the permission layer and `org_id` on every table: the call
 * site is cheap to write today and expensive to add later.
 *
 * See docs/05-saas-notes.md#prerequisites-for-phase-7
 */
@Injectable()
export class FeatureService {
  can(_orgId: string, _feature: Feature): boolean {
    return true
  }
}
