import { SetMetadata } from '@nestjs/common'

export const SKIP_ORG_SCOPE = 'skipOrgScope'

/**
 * Marks a route as legitimately not belonging to any single organisation —
 * signing in, health checks, and the Phase 7 back-office, which acts across
 * orgs by design.
 *
 * The guard skips establishing an org for these, which means anything they
 * touch through OrgScopedRepository will throw rather than quietly return
 * everything. That is intentional: an endpoint outside org scope has to reach
 * for data deliberately, naming the org it means.
 */
export const SkipOrgScope = () => SetMetadata(SKIP_ORG_SCOPE, true)
