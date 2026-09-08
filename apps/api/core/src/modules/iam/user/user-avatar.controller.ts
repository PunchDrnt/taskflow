import { Controller, Get, Param, Redirect } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { memberUserIdSchema } from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'

import { StorageService } from '../../storage/storage.service'
import { UserService } from './user.service'

/**
 * Somebody's profile picture, turned back into something a browser can draw.
 *
 * The bucket is private and stays private, so `avatarUrl` holds a storage key
 * rather than a URL and this is the one place that becomes a picture. A
 * presigned link attached to every row of every member list would mint
 * hundreds of them per screen, nearly all for avatars that are never drawn —
 * and each would expire while the page was still open.
 *
 * `@SkipOrgScope()` is deliberately **not** here: `iam.users` has no `org_id`,
 * so anybody signed in can look up anybody's picture. That is the same
 * exposure `GET /v1/org/members` and the assignee picker already have, and a
 * picture is the least of what those return.
 *
 * A value that is already an http(s) URL is redirected to unchanged — that is
 * a picture hosted somewhere else, and it needs no help.
 */
@ApiTags('me')
@Controller('users')
export class UserAvatarController {
  constructor(
    private readonly users: UserService,
    private readonly storage: StorageService,
  ) {}

  @Get(':userId/avatar')
  @Redirect()
  @ApiOperation({ summary: "Redirects to somebody's profile picture" })
  async avatar(
    @Param('userId', new ZodValidationPipe(memberUserIdSchema)) userId: string,
  ): Promise<{ url: string; statusCode: number }> {
    const user = await this.users.findById(userId)

    if (!user?.avatarUrl) throw ApiException.notFound('No profile picture')

    const url = /^https?:\/\//.test(user.avatarUrl)
      ? user.avatarUrl
      : await this.storage.presignedDownload(user.avatarUrl)

    // 302, not 301: the presigned URL expires, so nothing about this answer
    // may be cached as permanent.
    return { url, statusCode: 302 }
  }
}
