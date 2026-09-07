import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { requireOrgContext } from '#shared/org-scope/request-context'

import { actorFromContext } from './actor'
import { PermissionService } from './permission.service'
import {
  REQUIRE_PERMISSION,
  type RequiredPermission,
} from './require-permission.decorator'

/**
 * Answers `@RequirePermission(...)` before the handler runs.
 *
 * Bound to the routes that ask for it rather than global — see the decorator
 * for why that ordering matters — so reaching this class at all means the
 * route named a permission, and `AuthGuard` has already established who is
 * asking and which organisation for.
 *
 * The resource is the active organisation, built here rather than taken from
 * the decorator: an id that came from the route would be a caller's word for
 * which org they are acting in, and the context's is the one every scoped
 * query will use. Checking one and querying the other is how a check passes
 * for an org the request never touches.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredPermission>(
      REQUIRE_PERMISSION,
      [context.getHandler(), context.getClass()],
    )

    // Nothing asked for. Reachable when the decorator sits on a class and a
    // handler overrides it with nothing, so it is answered rather than
    // assumed impossible.
    if (!required) return true

    const { orgId } = requireOrgContext()

    this.permissions.assert(
      actorFromContext(),
      required.action,
      required.subject,
      { id: orgId },
    )

    return true
  }
}
