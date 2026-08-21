import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

import { runWithRequestContext } from './request-context'

/**
 * Establishes the request context, until Phase 1's `AuthGuard` takes it over —
 * auth belongs in a guard, since only a guard sees route metadata like
 * `@Public()`.
 *
 * What a guard cannot do is call `runWithRequestContext`: `canActivate`
 * returns a boolean, so the scope closes before the handler runs and
 * `getRequestContext()` comes back undefined in the controller. Middleware can,
 * because it calls `next()` from inside the scope. A guard has to use
 * `AsyncLocalStorage.enterWith` instead, which was measured to survive `await`s
 * and to stay per-request under concurrent load — so this is a note about
 * `run()`, not a verdict on guards.
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
