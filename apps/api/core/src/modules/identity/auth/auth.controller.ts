import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'

import {
  AUTH_ERROR_CODES,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { Public } from '#shared/http/route-metadata'
import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'

import { FeatureService } from '../../../feature/feature.service'
import { AuthCookies, REFRESH_TOKEN_COOKIE } from './auth.cookies'
import { AuthService } from './auth.service'
import { PasswordResetService } from './password-reset.service'

/**
 * Sign in, sign out, refresh. Every route is `@Public()` — not because they are
 * unprotected, but because the credential each one checks is in its own body or
 * cookie rather than in an access token the guard would look for.
 *
 * Logout works off the **refresh** cookie rather than the access token, which
 * is why it needs no session id from the caller: that cookie is scoped to
 * exactly this path, so it is present here and nowhere else in the API.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly features: FeatureService,
    private readonly cookies: AuthCookies,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body, {
      userAgent: request.get('user-agent') ?? 'unknown',
      // Both columns are NOT NULL and ip_address is `inet`, so an empty string
      // would not insert. Express resolves this from X-Forwarded-For only when
      // `trust proxy` is set, which Caddy's hop makes necessary.
      ipAddress: request.ip ?? '0.0.0.0',
    })

    this.cookies.setSession(response, result.tokens)

    // Set here rather than left to the guard: with one org there is nothing to
    // choose, and the first request after login should not have to 403 to
    // discover that.
    if (result.activeOrgId !== null) {
      this.cookies.setActiveOrg(response, result.activeOrgId)
    }

    // The org list rides along so the picker can be drawn without a second
    // round trip on the one screen where latency is most visible.
    return {
      organizations: result.memberships,
      activeOrgId: result.activeOrgId,
    }
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange the refresh token for a new pair' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      this.cookies.setSession(
        response,
        await this.auth.refresh(readCookie(request, REFRESH_TOKEN_COOKIE)),
      )
    } catch (error) {
      // A refresh that fails is a session that is over, so the cookies go with
      // it — otherwise the browser keeps presenting a token that will never
      // work again, and every reply looks the same as a network problem.
      this.cookies.clearSession(response)
      throw error
    }

    return { ok: true }
  }

  /**
   * Idempotent, and never an error: a caller with an expired token still wants
   * their cookies gone, and answering 401 to "sign me out" leaves the browser
   * holding a session it was told to forget.
   */
  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out this device' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const session = await this.sessionFromRefreshCookie(request)

    if (session) await this.auth.logout(session.id)

    this.cookies.clearSession(response)
  }

  @Post('logout-all')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out every device' })
  async logoutAll(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const session = await this.sessionFromRefreshCookie(request)

    if (session) await this.auth.logoutAll(session.userId)

    this.cookies.clearSession(response)
  }

  /**
   * Exists, and is off.
   *
   * docs/04-features/phase-1.md#auth--users is explicit that the endpoint
   * should be written now and gated rather than added later: with open
   * sign-up, anybody who knows the URL can create an account and wait for
   * somebody to mis-click them into an organisation. This is
   * `FeatureService`'s first real caller — the flag mechanism is Phase 7's,
   * but the call site is cheap today and expensive to retrofit.
   *
   * The org passed is null: whether this installation accepts sign-ups is not
   * a per-tenant question, and there is no tenant here to ask about.
   */
  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an account, if sign-up is enabled' })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
  ): Promise<{ id: string }> {
    if (!this.features.isEnabled(null, 'public_registration')) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        AUTH_ERROR_CODES.REGISTRATION_DISABLED,
        'ระบบนี้ไม่เปิดให้สมัครเอง กรุณาติดต่อผู้ดูแลองค์กร',
      )
    }

    return this.auth.register(body)
  }

  /**
   * 204 whether or not the address exists, always.
   *
   * That is the entire security property of this endpoint. Anything that
   * varied — a different status, a different message, or a reply that came
   * back faster because no mail was queued — would turn it into a way to test
   * whether a person has an account here. The work it does or does not do is
   * decided inside the service and never reaches the response.
   */
  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Send a password reset link, if the address exists',
  })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema))
    body: ForgotPasswordInput,
  ): Promise<void> {
    await this.passwordReset.request(body.email)
  }

  /**
   * Spends the emailed link. Revokes every session, including any the person
   * still has open elsewhere — if the reason for the reset was that somebody
   * else got in, those are the sessions that matter.
   *
   * Deliberately does not sign the caller in. Landing on the login screen with
   * the new password is one extra step and proves it works; issuing a session
   * to whoever posted the code would make the link a login rather than a
   * reset.
   */
  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password using an emailed link' })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ signedOutSessions: number }> {
    const result = await this.passwordReset.reset(body.code, body.newPassword)

    // Whatever this browser was holding is revoked now; leaving the cookies in
    // place would mean the next request answering 401 with a token that looks
    // valid, which is a confusing way to be signed out.
    this.cookies.clearSession(response)

    return result
  }

  private async sessionFromRefreshCookie(request: Request) {
    const presented = readCookie(request, REFRESH_TOKEN_COOKIE)
    if (presented === undefined) return null

    return this.auth.findSessionByRefreshToken(presented)
  }
}

/**
 * `cookie-parser` fills `request.cookies`, and `main.ts` installs it — but a
 * unit test building a request by hand does not, and neither would a mounted
 * sub-app that skipped the middleware. Reading through a helper means that is
 * a missing cookie rather than a TypeError on `undefined`.
 */
function readCookie(request: Request, name: string): string | undefined {
  const value = (request.cookies as Record<string, string> | undefined)?.[name]

  return value === undefined || value === '' ? undefined : value
}
