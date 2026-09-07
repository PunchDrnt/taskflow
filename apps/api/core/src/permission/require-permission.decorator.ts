import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'

import type { Action } from './ability'
import { PermissionGuard } from './permission.guard'

/**
 * The subjects a guard may decide on, which is a much shorter list than
 * `Subject` and deliberately so.
 *
 * A permission check needs the row being acted on — `PermissionService.can`
 * makes that argument mandatory for reasons its own docblock spells out. A
 * guard runs before the handler and has loaded nothing, so it can only supply
 * a resource it already holds. For an organisation it does: the active org
 * *is* the resource, and the guard knows its id from the request context.
 *
 * Everything else — a project, a task, a status — is a row named in the URL
 * that somebody has to fetch. Those check in the service, after the load, and
 * the type here is what stops the difference from being a matter of memory:
 * `@RequirePermission('delete', 'Project')` does not compile.
 *
 * Widening this list means proving the new subject's resource is knowable
 * from the context alone. "The guard could fetch it" is not that proof — a
 * guard that fetches has loaded the row twice, and the second load is the one
 * the handler acts on.
 */
export type ContextResolvedSubject = 'Organization'

export const REQUIRE_PERMISSION = 'requirePermission'

/** What the guard reads back: the question, without its resource. */
export interface RequiredPermission {
  action: Action
  subject: ContextResolvedSubject
}

/**
 * Refuses the request unless the caller may do `action` to the organisation
 * they are acting for.
 *
 * ⚠️ **Attached to the route rather than registered as `APP_GUARD`, and that
 * is the whole reason it is a decorator.** This guard reads the request
 * context that `AuthGuard` fills, so it has to run second — and Nest orders
 * global guards by the order their modules were provided, which would put the
 * security of every route in the hands of the import list in `app.module.ts`.
 * Route-bound guards always run after global ones, whatever that list says.
 *
 * It does not replace `PermissionService.assert`; it is the same question
 * asked where the answer is already available. Forgetting the decorator is
 * still an unchecked route — no decorator can fix that — but a route that has
 * one cannot disagree with the rules in `ability.ts`, which is what happens
 * when a controller reads `orgRole` and writes its own `if`.
 *
 * See docs/01-architecture.md#permission-hierarchy
 */
export const RequirePermission = (
  action: Action,
  subject: ContextResolvedSubject,
) =>
  applyDecorators(
    SetMetadata<string, RequiredPermission>(REQUIRE_PERMISSION, {
      action,
      subject,
    }),
    UseGuards(PermissionGuard),
  )
