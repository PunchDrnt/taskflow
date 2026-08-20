import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

import { runWithRequestContext } from './request-context'

/**
 * Establishes the request context for the whole of a request.
 *
 * Middleware rather than a guard, and not by preference: a guard returns a
 * boolean, so the AsyncLocalStorage scope it opens closes again the moment it
 * returns and the handler runs outside it. Verified — a guard that "sets" the
 * context leaves `getRequestContext()` undefined in the controller. Middleware
 * calls `next()` from inside the scope, so everything downstream sees it.
 *
 * Phase 1 replaces the placeholder read below with the authenticated session:
 * the org comes from the access token's `org` claim and the user from `sub`.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(
    request: Request & { auth?: { orgId: string; userId: string } },
    _response: Response,
    next: NextFunction,
  ): void {
    // Until auth lands there is nothing to read, and inventing a default org
    // here is the exact bug this layer exists to prevent. Requests without one
    // simply run with no context, and any org-scoped query throws rather than
    // quietly returning everything.
    if (!request.auth) {
      next()
      return
    }

    runWithRequestContext(request.auth, () => next())
  }
}
