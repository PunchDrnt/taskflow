import { Injectable } from '@nestjs/common'

/**
 * Everything a plan could gate. Listed here rather than as free strings so a
 * typo is a compile error instead of a silently-open feature.
 */
export const FEATURES = ['public_registration'] as const
export type Feature = (typeof FEATURES)[number]

/**
 * The features that are on. Empty is not an oversight — it is the whole
 * mechanism: anything absent is off, so adding a name to `FEATURES` gates it
 * rather than opening it.
 *
 * A deny-by-default list is the only shape that fails safe. The obvious
 * alternative — return `true` until Phase 7 brings the plan lookup — reads as
 * "nothing is gated yet" and means "everything is open", and the two are
 * indistinguishable at the call site: `if (isEnabled(org, 'x'))` looks equally
 * careful either way.
 *
 * Set membership rather than a boolean per feature so a new entry in `FEATURES`
 * needs no edit here to be off.
 */
const ENABLED_FEATURES = new Set<Feature>()

/**
 * `isEnabled(org, feature)` — does this organisation's plan include it?
 *
 * Nothing is enabled until Phase 7 turns this into a plan lookup, and until
 * then the org is ignored. It exists now because retrofitting it means editing
 * every controller at once, which is the same argument as the permission layer
 * and `org_id` on every table: the call site is cheap to write today and
 * expensive to add later.
 *
 * The org is nullable because the first real caller — `POST /v1/auth/register`
 * — asks before anybody has one. That is not a gap in the caller but the shape
 * of the question: whether this *installation* accepts sign-ups is not a
 * per-tenant answer, and Phase 7 has to decide what it means there rather than
 * be handed an org that was invented to satisfy the signature.
 *
 * Not `can()`: PermissionService already owns that word, with a different
 * question behind it. "May this person do it" and "does this plan include it"
 * are separate answers, and a call site should not have to guess which one it
 * just asked.
 *
 * See docs/05-saas-notes.md#prerequisites-for-phase-7
 */
@Injectable()
export class FeatureService {
  isEnabled(_orgId: string | null, feature: Feature): boolean {
    return ENABLED_FEATURES.has(feature)
  }
}
