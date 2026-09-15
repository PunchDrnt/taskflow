import { Controller, Get, Param, Res } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import { memberUserIdSchema } from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'

import { isStorageKey } from '../../storage/storage-key'
import { StorageService } from '../../storage/storage.service'
import { UserService } from './user.service'

/**
 * How long a browser may keep somebody's picture before asking again.
 *
 * Short, because the address never changes: `avatar_url` holds a new key after
 * an upload but this route's URL is the same one, so a long cache would leave
 * the person who just changed their picture looking at the old one. A minute
 * is enough to stop a member list of thirty faces being thirty requests per
 * navigation, and short enough that a change appears while somebody is still
 * wondering whether it worked.
 */
const CACHE_SECONDS = 60

/**
 * Somebody's profile picture, served by the API.
 *
 * `avatar_url` holds a **storage key**, not a URL, and the bucket is private —
 * so this is the one place a key becomes an image. It reads the object and
 * pipes it, rather than redirecting to a presigned URL as it used to: the
 * store is not reachable from a browser and is not meant to be, since
 * `S3_HOST` on a deployed server is `garage`, a name that resolves inside one
 * Docker network. Redirecting there produced a broken image everywhere except
 * a developer's laptop.
 *
 * Piped, not buffered. The whole file is never in memory here — the size limit
 * belongs on the way in, and this side should not grow one of its own.
 *
 * `@SkipOrgScope()` is deliberately **not** here: `iam.users` has no `org_id`,
 * so anybody signed in can look up anybody's picture. That is the same
 * exposure `GET /v1/org/members` and the assignee picker already have, and a
 * picture is the least of what those return.
 *
 * A value that is already an http(s) URL is still redirected to unchanged —
 * that is a picture hosted somewhere else, and it needs no help.
 */
@ApiTags('me')
@Controller('users')
export class UserAvatarController {
  constructor(
    private readonly users: UserService,
    private readonly storage: StorageService,
  ) {}

  @Get(':userId/avatar')
  @ApiOperation({ summary: "Somebody's profile picture" })
  async avatar(
    @Param('userId', new ZodValidationPipe(memberUserIdSchema)) userId: string,
    @Res() response: Response,
  ): Promise<void> {
    const user = await this.users.findById(userId)

    if (!user?.avatarUrl) throw ApiException.notFound('No profile picture')

    if (!isStorageKey(user.avatarUrl)) {
      // 302, not 301: somebody else's server, and what it holds is not ours to
      // declare permanent.
      response.redirect(302, user.avatarUrl)

      return
    }

    const object = await this.storage.get(user.avatarUrl)

    // The row points at an object that is not there — a picture deleted out
    // from under it, or an upload that never finished. Missing, not broken.
    if (object === null) throw ApiException.notFound('No profile picture')

    response.setHeader('content-type', object.contentType)
    response.setHeader('cache-control', `private, max-age=${CACHE_SECONDS}`)

    if (object.contentLength !== undefined) {
      response.setHeader('content-length', object.contentLength)
    }

    if (object.etag !== undefined) response.setHeader('etag', object.etag)

    // The headers are already out by the time this can fire, so there is no
    // status left to send: cutting the connection is what tells the browser
    // the picture is not coming, rather than leaving it waiting on a body that
    // ended early.
    object.body.on('error', () => {
      response.destroy()
    })

    object.body.pipe(response)
  }
}
