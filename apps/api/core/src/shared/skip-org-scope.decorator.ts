import { SetMetadata } from '@nestjs/common'

export const SKIP_ORG_SCOPE = 'skipOrgScope'

/**
 * Marks a route as legitimately not belonging to any single organisation —
 * signing in, health checks, and the Phase 7 back-office, which acts across
 * orgs by design.
 *
 * Nothing reads it yet — RequestContextMiddleware establishes a context
 * whenever the request carries one, and the authorization guard that consults
 * this marker arrives with auth in Phase 1. It exists now so the marker is
 * available at the point routes start being written, and so the intent is
 * recorded: a route outside org scope reaches for data deliberately, naming
 * the org it means, rather than inheriting one.
 *
 * A route with no context is not a route that sees everything —
 * OrgScopedRepository throws without one.
 */
export const SkipOrgScope = () => SetMetadata(SKIP_ORG_SCOPE, true)
