import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'

import { provideOrgRepository } from '#shared/org-scope/org-repository.provider'

import type { Env } from '../../../config/env'
import { OrganizationModule } from '../../organization/organization.module'
import { UserModule } from '../user/user.module'
import { AuthCookiesModule } from './auth-cookies.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { LockoutService } from './lockout.service'
import { PasswordService } from './password.service'
import { Session } from './session.entity'
import { SessionService } from './session.service'
import { ACCESS_TOKEN_TTL_SECONDS, TokenService } from './token.service'

/**
 * Auth: sign in, sign out, refresh, and the per-request check the guard will
 * run.
 *
 * `@nestjs/jwt` and a guard of our own rather than `@nestjs/passport`: passport
 * costs three callback-era dependencies for an `ExtractJwt` that is one line
 * here (docs/01-architecture.md#auth). The secret is bound once, in this
 * factory, so TokenService never reads config.
 *
 * Exports `AuthService` for the guard, which lives in `APP_GUARD` and so is
 * constructed by the root module rather than by this one.
 */
@Module({
  imports: [
    AuthCookiesModule,
    UserModule,
    OrganizationModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        // HS256 is JwtService's default and is named anyway: a token whose
        // header says `alg: none` must not verify, and the way that is
        // guaranteed is by the verifier accepting exactly one algorithm.
        signOptions: {
          algorithm: 'HS256',
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    provideOrgRepository(Session),
    PasswordService,
    TokenService,
    SessionService,
    LockoutService,
    AuthService,
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
