import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'

import type { Env } from '../../../config/env'
import { AuthCookies } from './auth.cookies'
import { PasswordService } from './password.service'
import { ACCESS_TOKEN_TTL_SECONDS, TokenService } from './token.service'

/**
 * Auth. Holds the primitives today — hashing, tokens, cookies — and the login
 * flow that uses them arrives next.
 *
 * `@nestjs/jwt` and a guard of our own rather than `@nestjs/passport`: passport
 * costs three callback-era dependencies for an `ExtractJwt` that is one line
 * here (docs/01-architecture.md#auth). The secret is bound once, in this
 * factory, so TokenService never reads config.
 */
@Module({
  imports: [
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
  providers: [PasswordService, TokenService, AuthCookies],
  exports: [PasswordService, TokenService, AuthCookies],
})
export class AuthModule {}
