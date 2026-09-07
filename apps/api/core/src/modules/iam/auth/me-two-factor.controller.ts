import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import {
  twoFactorDisableSchema,
  twoFactorEnableSchema,
  twoFactorSetupSchema,
  type TwoFactorDisableInput,
  type TwoFactorEnableInput,
  type TwoFactorSetupInput,
} from '@repo/shared'

import { SkipOrgScope } from '#shared/http/route-metadata'
import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'
import { requireRequestContext } from '#shared/org-scope/request-context'

import { TwoFactorService, type TotpSetup } from './two-factor.service'

/**
 * Turning the second factor on and off, on the `me` path and in the `auth`
 * module for the reason `MePasswordController` gives: the path is what the
 * screen calls, the module is where the dependencies are.
 *
 * `@SkipOrgScope()` throughout — this is about the account, and somebody in no
 * organisation still gets to protect theirs.
 */
@ApiTags('me')
@Controller('me/2fa')
export class MeTwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  /**
   * Mints a secret and returns it once, with the `otpauth://` URI the QR code
   * encodes. The QR is drawn by the browser: rendering one here would mean an
   * image library and a round trip for something a client can do from a
   * string, and the secret would then exist in one more place.
   *
   * Nothing is enforced yet — `enable` is what commits it.
   */
  @Post('setup')
  @SkipOrgScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin enrolling an authenticator app' })
  async setup(
    @Body(new ZodValidationPipe(twoFactorSetupSchema))
    body: TwoFactorSetupInput,
  ): Promise<TotpSetup> {
    const { userId } = requireRequestContext()

    return this.twoFactor.startSetup(userId, body.password)
  }

  /**
   * Commits it, and answers with the recovery codes — the one and only time
   * they are readable. Only their hashes are kept, so a person who loses both
   * the phone and the codes needs an administrator, not a lookup.
   */
  @Post('enable')
  @SkipOrgScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm the app and switch two-factor on' })
  async enable(
    @Body(new ZodValidationPipe(twoFactorEnableSchema))
    body: TwoFactorEnableInput,
  ): Promise<{ recoveryCodes: string[] }> {
    const { userId } = requireRequestContext()

    return this.twoFactor.enable(userId, body.code)
  }

  /**
   * Off, taking the recovery codes and every other session with it — anything
   * signed in elsewhere was admitted under the stronger rule.
   */
  @Delete()
  @SkipOrgScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Switch two-factor off' })
  async disable(
    @Body(new ZodValidationPipe(twoFactorDisableSchema))
    body: TwoFactorDisableInput,
  ): Promise<{ signedOutSessions: number }> {
    const { userId, sessionId } = requireRequestContext()

    if (sessionId === null) {
      throw new Error(
        'DELETE /v1/me/2fa ran with no session in the request context, ' +
          'which should be impossible behind AuthGuard.',
      )
    }

    return this.twoFactor.disable(userId, sessionId, body.password)
  }
}
