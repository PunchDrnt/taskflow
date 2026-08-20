import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

import { runWithRequestContext } from './request-context'

/**
 * Establishes the request context.
 *
 * Middleware rather than a guard, and not by preference: a guard returns a
 * boolean, so the AsyncLocalStorage scope it opens closes before the handler
 * runs — verified, `getRequestContext()` comes back undefined in the
 * controller. Middleware calls `next()` from inside the scope.
 *
 * Phase 1 replaces the read below with the access token's `org` and `sub`.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(
    request: Request & { auth?: { orgId: string; userId: string } },
    _response: Response,
    next: NextFunction,
  ): void {
    // No default org invented here — that is the bug this layer exists to
    // prevent. With no context, an org-scoped query throws.
    if (!request.auth) {
      next()
      return
    }

    runWithRequestContext(request.auth, () => next())
  }
}
