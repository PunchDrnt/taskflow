import {
  HttpStatus,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request, Response } from 'express'

import { AUTH_ERROR_CODES } from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { IS_PUBLIC, SKIP_ORG_SCOPE } from '#shared/http/route-metadata'
import { openRequestContext } from '#shared/org-scope/request-context'

import { resolveActiveOrg } from '../../organization/membership.service'
import {
  ACCESS_TOKEN_COOKIE,
  ACTIVE_ORG_COOKIE,
  AuthCookies,
} from './auth.cookies'
import { AuthService } from './auth.service'
import { TokenService } from './token.service'

/**
 * The whole of auth, in one place: verify the token, check the session, decide
 * which org this request is for, and open the request context.
 *
 * A guard rather than middleware because only a guard sees route metadata —
 * `@Public()` and `@SkipOrgScope()` are resolved by `Reflector` after routing,
 * which middleware runs before. Splitting it in two would mean two things
 * establishing the context and one of them being forgotten.
 *
 * Global via `APP_GUARD`, so a new controller is protected by default and
 * opting out is a decorator somebody has to write down.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly cookies: AuthCookies,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()]

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      return true
    }

    // 🔒 Before the first `await` in this method, and it has to stay there.
    // `enterWith` writes into the async resource executing right now: up here
    // that is still the one Express owns, which the handler inherits, and
    // after the session lookup below it is a promise resource the handler
    // never sees. The org is not known yet, so the slot is opened now and
    // filled at the bottom. See `openRequestContext` for the measurement.
    const fillRequestContext = openRequestContext()

    const http = context.switchToHttp()
    const request = http.getRequest<Request>()

    const claims = this.tokens.verifyAccessToken(
      readCookie(request, ACCESS_TOKEN_COOKIE) ?? '',
    )
    if (!claims) throw ApiException.unauthenticated()

    // Revoked, expired, or the account is no longer active — all of which the
    // token itself cannot express, which is why this runs every request.
    const caller = await this.auth.authenticate(claims.sid)
    if (!caller || caller.userId !== claims.sub) {
      throw ApiException.unauthenticated()
    }

    const active = resolveActiveOrg(
      caller.memberships,
      readCookie(request, ACTIVE_ORG_COOKIE),
    )

    if (active.clearCookie) {
      this.cookies.clearActiveOrg(http.getResponse<Response>())
    }

    if (
      active.orgId === null &&
      !this.reflector.getAllAndOverride<boolean>(SKIP_ORG_SCOPE, targets)
    ) {
      throw noOrg(caller.memberships.length)
    }

    fillRequestContext({
      userId: caller.userId,
      orgId: active.orgId,
      orgRole: active.orgRole,
      sessionId: caller.sessionId,
    })

    return true
  }
}

/**
 * Two codes, never one. "You are in three organizations and have not picked"
 * and "you are in none" need different screens, and collapsing them sends
 * somebody with three companies to a create-your-first-organization page.
 */
function noOrg(membershipCount: number): ApiException {
  return membershipCount === 0
    ? new ApiException(
        HttpStatus.FORBIDDEN,
        AUTH_ERROR_CODES.NO_ORGANIZATION,
        'You do not belong to any organisation yet',
      )
    : new ApiException(
        HttpStatus.FORBIDDEN,
        AUTH_ERROR_CODES.ORG_NOT_SELECTED,
        'Choose an organisation first',
      )
}

/** `cookie-parser` fills this; a request that never met it has no cookies. */
function readCookie(request: Request, name: string): string | undefined {
  const value = (request.cookies as Record<string, string> | undefined)?.[name]

  return value === undefined || value === '' ? undefined : value
}
