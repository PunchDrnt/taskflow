import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import { setActiveOrgSchema, type SetActiveOrgInput } from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { SkipOrgScope } from '#shared/http/route-metadata'
import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'
import { requireRequestContext } from '#shared/org-scope/request-context'

import { MembershipService } from '../../organization/membership.service'
import { AuthCookies } from '../auth/auth.cookies'

/**
 * The signed-in person, across organisations rather than inside one — hence
 * `@SkipOrgScope()` on everything here.
 *
 * Only the org switch exists so far. `GET /v1/me` is the next commit's; this
 * one ships now because the guard is unusable for anybody in two organisations
 * without a way to say which they mean.
 */
@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(
    private readonly memberships: MembershipService,
    private readonly cookies: AuthCookies,
  ) {}

  /**
   * Checked against the caller's memberships rather than trusted, which is the
   * whole reason the cookie can be a plain org id: it is a *choice*, and the
   * guard re-checks it on every request regardless. Setting it to somebody
   * else's org gets a 403 here and would get one there too.
   */
  @Post('active-org')
  @SkipOrgScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Choose which organisation this session acts for' })
  async setActiveOrg(
    @Body(new ZodValidationPipe(setActiveOrgSchema)) body: SetActiveOrgInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { userId } = requireRequestContext()

    const membership = (await this.memberships.listForUser(userId)).find(
      (candidate) => candidate.orgId === body.orgId,
    )

    // 403 rather than 404: the caller named an id they hold, and telling them
    // it does not exist would be a lie whenever it does.
    if (!membership)
      throw ApiException.forbidden('ไม่ได้เป็นสมาชิกขององค์กรนี้')

    this.cookies.setActiveOrg(response, membership.orgId)

    return membership
  }
}
