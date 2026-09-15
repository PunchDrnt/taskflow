import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import {
  AVATAR_MAX_BYTES,
  AVATAR_MAX_EDGE,
  AVATAR_MIME_TYPES,
  AVATAR_QUALITY,
  avatarFileNameSchema,
  setActiveOrgSchema,
  updateProfileSchema,
  type AvatarMimeType,
  type Me,
  type SetActiveOrgInput,
  type UpdateProfileInput,
} from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { ApiZodBody } from '#shared/http/api-zod'
import { SkipOrgScope } from '#shared/http/route-metadata'
import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'
import { requireRequestContext } from '#shared/org-scope/request-context'

import { MembershipService } from '../../organization/member/membership.service'
import { isStorageKey, storageKey } from '../../storage/storage-key'
import { StorageService } from '../../storage/storage.service'
import { toStoredImage } from '../../storage/stored-image'
import { UserService } from '../user/user.service'
import { AuthCookies } from './session/auth-cookies'
import { TwoFactorService } from './two-factor/two-factor.service'

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

  private readonly logger = new Logger(MeController.name)

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

    // Read before the write, so the object a replacement leaves behind still
    // has a name. The row is the only record of where the old picture is.
    const previous = (await this.users.findById(userId))?.avatarUrl ?? null

    await this.users.updateProfile(userId, body)

    await this.discardAvatar(previous, body.avatarUrl)

    return this.me()
  }

  /**
   * The picture that has just been replaced, taken out of the bucket.
   *
   * Without this, changing a profile picture ten times left ten objects and
   * nine of them unreachable — nothing points at them, nothing lists them, and
   * they are paid for forever. The row is the only index of the bucket, so the
   * moment it stops naming an object is the only moment that object can still
   * be found.
   *
   * **After the update, not before, and never inside a transaction with it.**
   * A delete that cannot be rolled back has no business running before the
   * write that makes it correct: if the profile save fails, the old picture is
   * still the picture. The cost of this order is the opposite failure — the
   * row is saved and the delete does not happen — which leaves exactly the
   * orphan this method exists to avoid, and that is the cheaper of the two.
   *
   * A failure is therefore logged rather than thrown. The caller asked to
   * change their name and picture; both happened. Storage the API could not
   * tidy is not their problem to be told about.
   *
   * ⚠️ **Still not swept: a picture uploaded and then abandoned** — the form
   * closed without saving, so no row ever named the key and nothing here can
   * know it exists. That one needs a listing over `storagePrefix({ user })`
   * compared against the row, which `StorageService` has no `list` for yet.
   */
  private async discardAvatar(
    previous: string | null,
    next: string | null,
  ): Promise<void> {
    // Unchanged, never set, or somebody else's URL — which is not ours to
    // delete and would not be a key to delete by anyway.
    if (previous === null || previous === next || !isStorageKey(previous)) {
      return
    }

    try {
      await this.storage.remove(previous)
    } catch (error) {
      this.logger.warn(
        { err: error, key: previous },
        'Could not remove the replaced profile picture',
      )
    }
  }

  /**
   * Checked against the caller's memberships rather than trusted, which is the
   * whole reason the cookie can be a plain org id: it is a *choice*, and the
   * guard re-checks it on every request regardless. Setting it to somebody
   * else's org gets a 403 here and would get one there too.
   */
  /**
   * Takes a new profile picture and stores it, answering with its key.
   *
   * **Through the API, not straight to the bucket.** The browser used to PUT
   * to a presigned URL, which kept the file out of Node at the price of the
   * browser needing a route to object storage — and on the server `S3_HOST` is
   * `garage`, a name that resolves inside one Docker network and nowhere else,
   * so both halves of the feature only ever worked in development. Publishing
   * the store would have meant a second public origin and a CORS rule to
   * police it, and the signed URL still carried no size limit of its own.
   *
   * That last part is the real gain: `limits.fileSize` aborts the request
   * mid-stream, so a refused upload costs the bytes read so far and not a
   * whole file, and the type is checked against what was actually sent rather
   * than against a filename anybody could have typed.
   *
   * `@SkipOrgScope()` because a profile picture belongs to the person and not
   * to whichever organisation they are acting for — and so, now, does the key:
   * `user/<id>/avatar/...`. It was filed under the active org until the layout
   * in `storage-key.ts` was fixed, which meant somebody in two companies had
   * their picture under whichever one they were looking at, waiting for the
   * first thing that deletes an organisation to take it.
   *
   * The key is returned rather than saved: `PATCH /v1/me` applies it with the
   * rest of the profile, so a picture chosen and then abandoned changes
   * nothing. What it does leave is an unreferenced object, which is the same
   * thing replacing a picture leaves and is swept up in neither case yet.
   */
  @Post('avatar')
  @SkipOrgScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload a new profile picture' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      // In memory, deliberately: bounded by the same limit, and a temporary
      // file would need cleaning up on every path out of here including the
      // ones that throw.
      limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
    }),
  )
  async uploadAvatar(
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<{ key: string }> {
    const { userId } = requireRequestContext()

    if (file === undefined) throw ApiException.badRequest('No file was sent')

    // Cheap and first, so an obvious wrong answer costs nothing. It is not the
    // real check — a content type is a claim the sender makes about itself.
    // `toStoredImage` decoding the bytes is the check.
    if (!AVATAR_MIME_TYPES.includes(file.mimetype as AvatarMimeType)) {
      throw ApiException.badRequest(
        `A profile picture must be ${AVATAR_MIME_TYPES.join(', ')}`,
      )
    }

    const fileName = avatarFileNameSchema.safeParse(file.originalname)

    if (!fileName.success) {
      throw ApiException.badRequest('That file name will not do')
    }

    const image = await toStoredImage(file.buffer, {
      maxEdge: AVATAR_MAX_EDGE,
      quality: AVATAR_QUALITY,
    })

    // Named for what it is now, not for what was sent. Everything stored here
    // is WebP, and an object called `.png` holding WebP bytes misleads whoever
    // opens the bucket later at no benefit.
    const key = storageKey({
      owner: { user: userId },
      entityType: 'avatar',
      fileName: `${stem(fileName.data)}.webp`,
    })

    await this.storage.put(key, image, 'image/webp')

    // The key, not a URL: the bucket is private and stays private, so there is
    // no URL that keeps working. `GET /v1/users/:id/avatar` is what turns it
    // back into a picture.
    return { key }
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

/**
 * What multer hands a route, narrowed to the parts this one reads.
 *
 * Declared here rather than reaching for `Express.Multer.File`, which lives in
 * a global namespace that only exists once `@types/multer` is installed — a
 * dependency worth avoiding for four fields.
 */
interface UploadedImage {
  originalname: string
  mimetype: string
  buffer: Buffer
}

/** A file name with its extension removed, and nothing else changed. */
function stem(fileName: string): string {
  return fileName.replace(/\.[^./\\]{1,12}$/, '')
}
