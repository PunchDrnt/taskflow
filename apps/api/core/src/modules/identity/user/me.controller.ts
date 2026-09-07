import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Res,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import {
  setActiveOrgSchema,
  updateProfileSchema,
  type SetActiveOrgInput,
  type UpdateProfileInput,
} from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { SkipOrgScope } from '#shared/http/route-metadata'
import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'
import { requireRequestContext } from '#shared/org-scope/request-context'

import {
  MembershipService,
  type Membership,
} from '../../organization/membership.service'
import { AuthCookies } from '../auth/auth.cookies'
import { UserService } from './user.service'

/**
 * The signed-in person, across organisations rather than inside one — hence
 * `@SkipOrgScope()` on everything here.
 *
 * Only the org switch exists so far. `GET /v1/me` is the next commit's; this
 * one ships now because the guard is unusable for anybody in two organisations
 * without a way to say which they mean.
 */
/** What `GET /v1/me` answers with, and what `PATCH /v1/me` echoes back. */
export interface Me {
  id: string
  email: string
  name: string
  nickname: string
  avatarUrl: string | null
  status: string
  organizations: Membership[]
  /** Null while the caller is in several organisations and has picked none. */
  activeOrgId: string | null
  /** The caller's role in `activeOrgId`, null when there is no active org. */
  role: string | null
}

@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(
    private readonly memberships: MembershipService,
    private readonly users: UserService,
    private readonly cookies: AuthCookies,
  ) {}

  /**
   * Everything the shell needs to draw itself: who you are, which
   * organisations you may act for, and which one this session is acting for.
   *
   * One request rather than three, because every screen needs all of it before
   * it can render anything — and the org list is what the picker is built
   * from, so a client that could not get it while `orgId` is null would have
   * no way out of that state.
   */
  @Get()
  @SkipOrgScope()
  @ApiOperation({ summary: 'The signed-in person and their organisations' })
  async me(): Promise<Me> {
    const { userId, orgId } = requireRequestContext()

    const [user, memberships] = await Promise.all([
      this.users.findById(userId),
      this.memberships.listForUser(userId),
    ])

    // The guard checked the session a moment ago, so this is a row deleted
    // between then and now rather than a caller who was never signed in.
    if (!user) throw ApiException.unauthenticated()

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      status: user.status,
      organizations: memberships,
      activeOrgId: orgId,
      // The role that applies to what this request can do. Null while no org
      // is chosen, which is not the same as having no role anywhere.
      role: memberships.find((one) => one.orgId === orgId)?.role ?? null,
    }
  }

  /**
   * `@SkipOrgScope()` like everything else here: somebody in no organisation
   * can still sign in, and telling them to fix their profile while refusing
   * the request that saves it would be a dead end.
   */
  @Patch()
  @SkipOrgScope()
  @ApiOperation({ summary: 'Edit your own profile' })
  async updateProfile(
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<Me> {
    const { userId } = requireRequestContext()

    await this.users.updateProfile(userId, body)

    return this.me()
  }

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
