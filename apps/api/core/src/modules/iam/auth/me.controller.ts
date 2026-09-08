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
  avatarUploadSchema,
  setActiveOrgSchema,
  updateProfileSchema,
  type AvatarUploadInput,
  type OrgRole,
  type SetActiveOrgInput,
  type UpdateProfileInput,
} from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { ApiZodBody } from '#shared/http/api-zod'
import { SkipOrgScope } from '#shared/http/route-metadata'
import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'
import { requireRequestContext } from '#shared/org-scope/request-context'

import {
  MembershipService,
  type Membership,
} from '../../organization/membership.service'
import { StorageService } from '../../storage/storage.service'
import { UserService } from '../user/user.service'
import { AuthCookies } from './auth.cookies'
import { TwoFactorService } from './two-factor.service'

/**
 * The signed-in person, across organisations rather than inside one — hence
 * `@SkipOrgScope()` on everything here.
 *
 * In `auth/` rather than `user/`, like the password and two-factor controllers
 * beside it: `/me` reads its own 2FA state and its own memberships, and having
 * `UserModule` import `AuthModule` would close the cycle `AuthCookiesModule`
 * was created to avoid. The path is what the screen calls; the module is where
 * the dependencies already are.
 */
/** What `GET /v1/me` answers with, and what `PATCH /v1/me` echoes back. */
export interface Me {
  id: string
  email: string
  username: string
  name: string
  nickname: string
  phone: string | null
  avatarUrl: string | null
  status: string
  /** Whether a second factor stands between this account and a session. */
  twoFactorEnabled: boolean
  organizations: Membership[]
  /** Null while the caller is in several organisations and has picked none. */
  activeOrgId: string | null
  /** The caller's role in `activeOrgId`, null when there is no active org. */
  role: OrgRole | null
}

@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(
    private readonly memberships: MembershipService,
    private readonly users: UserService,
    private readonly twoFactor: TwoFactorService,
    private readonly cookies: AuthCookies,
    private readonly storage: StorageService,
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

    const [user, memberships, twoFactorEnabled] = await Promise.all([
      this.users.findById(userId),
      this.memberships.listForUser(userId),
      this.twoFactor.isEnabled(userId),
    ])

    // The guard checked the session a moment ago, so this is a row deleted
    // between then and now rather than a caller who was never signed in.
    if (!user) throw ApiException.unauthenticated()

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      nickname: user.nickname,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      status: user.status,
      twoFactorEnabled,
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
  @ApiZodBody(updateProfileSchema)
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
  /**
   * Somewhere to PUT a new avatar, and the URL to record once it is there.
   *
   * Two round trips rather than one multipart upload through the API, and
   * worth it: the file never occupies a Node process, an abandoned upload
   * leaves nothing but an unreferenced object, and the API does not become a
   * proxy whose memory limit is the real file size limit.
   *
   * `@SkipOrgScope()` because a profile picture belongs to the person, not to
   * whichever organisation they are acting for — but the key is filed under
   * the active org when there is one, so a bucket listing still groups by
   * customer. With no active org it goes under the user's own id.
   *
   * Reading it back is `GET /v1/users/:userId/avatar`, which presigns and
   * redirects — one place rather than a presigned URL attached to every row of
   * every member list and every assignee chip, most of which are never drawn.
   */
  @Post('avatar-upload')
  @SkipOrgScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'A URL to upload a new profile picture to' })
  @ApiZodBody(avatarUploadSchema)
  async avatarUpload(
    @Body(new ZodValidationPipe(avatarUploadSchema)) body: AvatarUploadInput,
  ): Promise<{ uploadUrl: string; key: string }> {
    const { userId, orgId } = requireRequestContext()

    const key = this.storage.keyFor(
      orgId ?? userId,
      'avatar',
      userId,
      body.fileName,
    )

    return {
      uploadUrl: await this.storage.presignedUpload(key),
      // What to send back in `PATCH /v1/me`. The key, not a URL: the bucket
      // is private and stays private, so there is no URL that keeps working.
      // `GET /v1/users/:id/avatar` is what turns it back into a picture.
      key,
    }
  }

  @Post('active-org')
  @SkipOrgScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Choose which organisation this session acts for' })
  @ApiZodBody(setActiveOrgSchema)
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
      throw ApiException.forbidden('You are not a member of that organisation')

    this.cookies.setActiveOrg(response, membership.orgId)

    return membership
  }
}
