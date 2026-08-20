import { SetMetadata } from '@nestjs/common'

export const SKIP_ORG_SCOPE = 'skipOrgScope'

/**
 * Marks a route as legitimately outside org scope — signing in, health checks,
 * the Phase 7 back-office.
 *
 * Nothing reads it until the Phase 1 auth guard. Note that a route with no
 * context is not a route that sees everything: OrgScopedRepository throws.
 */
export const SkipOrgScope = () => SetMetadata(SKIP_ORG_SCOPE, true)
