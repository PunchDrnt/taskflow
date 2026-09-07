import { Body, Controller, HttpCode, HttpStatus, Patch } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { changePasswordSchema, type ChangePasswordInput } from '@repo/shared'

import { ApiZodBody } from '#shared/http/api-zod'
import { SkipOrgScope } from '#shared/http/route-metadata'
import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'
import { requireRequestContext } from '#shared/org-scope/request-context'

import { AuthService } from './auth.service'

/**
 * `PATCH /v1/me/password`, on the `me` path but in the `auth` module.
 *
 * The path is what docs/01-architecture.md#auth fixes and what the screen
 * calls; the module is where the dependencies are. Putting it on `MeController`
 * would mean `UserModule` importing `AuthModule`, which already imports
 * `UserModule` — the cycle `AuthCookiesModule` exists to avoid. Nest merges
 * controllers sharing a prefix, so the route reads the same either way.
 */
@ApiTags('me')
@Controller('me')
export class MePasswordController {
  constructor(private readonly auth: AuthService) {}

  /**
   * `@SkipOrgScope()` for the same reason the rest of `/me` is: this is about
   * the account, not about any organisation, and somebody in none still needs
   * to be able to change their password.
   */
  @Patch('password')
  @SkipOrgScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change your password and sign other devices out' })
  @ApiZodBody(changePasswordSchema)
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordSchema))
    body: ChangePasswordInput,
  ): Promise<{ signedOutSessions: number }> {
    const { userId, sessionId } = requireRequestContext()

    // Non-null in practice: the guard fills both, and a request that reached a
    // controller went through the guard. The type admits null because a job
    // has no session, and asserting here rather than at the top of the context
    // keeps that honest for the callers that really do run without one.
    if (sessionId === null) {
      throw new Error(
        'PATCH /v1/me/password ran with no session in the request context, ' +
          'which should be impossible behind AuthGuard.',
      )
    }

    return this.auth.changePassword(userId, sessionId, body)
  }
}
