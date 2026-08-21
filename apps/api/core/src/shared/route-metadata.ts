import { SetMetadata } from '@nestjs/common'

/**
 * The two questions Phase 1's `AuthGuard` asks about a route, kept in one file
 * because they are easy to confuse and the answers are independent.
 *
 * |                   | signed in? | bound to an org? |
 * | ----------------- | ---------- | ---------------- |
 * | (neither)         | required   | required         |
 * | `@Public()`       | no         | no               |
 * | `@SkipOrgScope()` | required   | no               |
 *
 * Nothing reads either until the guard exists — see
 * docs/01-architecture.md#auth.
 */

export const IS_PUBLIC = 'isPublic'

/**
 * Anyone may call this, signed in or not: `/auth/login`, `/health`.
 *
 * Only a guard can see this, which is the reason auth is a guard rather than
 * middleware — middleware runs before route metadata is resolved.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true)

export const SKIP_ORG_SCOPE = 'skipOrgScope'

/**
 * Signed in, but acting outside any one organisation: `GET /me`, the Phase 7
 * back-office. Not an escape hatch — a route with no org context is not a
 * route that sees every org, because OrgScopedRepository throws rather than
 * widening.
 */
export const SkipOrgScope = () => SetMetadata(SKIP_ORG_SCOPE, true)
