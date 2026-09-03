/**
 * What a system-level role can be granted. System RBAC crosses organisations
 * and is ours, not a customer's — see docs/01-architecture.md#permission-hierarchy.
 *
 * Keys live here for type safety; the role → permission mapping lives in the
 * database so it can change without a deploy. Nothing reads these until
 * Phase 7 brings the back-office; Phase 0 only seeds them.
 *
 * `database/seed/required.ts` inserts exactly these keys and runs on every
 * deploy, so adding one here is the whole change — no migration, and nothing
 * to keep in step.
 */
export const SYSTEM_PERMISSIONS = {
  ORG_READ: 'org.read',
  ORG_SUSPEND: 'org.suspend',
  USER_IMPERSONATE: 'user.impersonate',
  BILLING_REFUND: 'billing.refund',
  LOG_READ: 'log.read',
  ROLE_MANAGE: 'role.manage',
} as const

export type SystemPermissionKey =
  (typeof SYSTEM_PERMISSIONS)[keyof typeof SYSTEM_PERMISSIONS]
