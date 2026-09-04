import { Module } from '@nestjs/common'

import { AuthCookies } from './auth.cookies'

/**
 * `AuthCookies` alone, so that both `AuthModule` and `UserModule` can reach it
 * without importing each other.
 *
 * The pull is real in both directions: auth sets the session cookies at login,
 * and `/me/active-org` sets the org cookie — while `AuthService` needs
 * `UserService`. Given AuthCookies its own module rather than a `forwardRef`,
 * because a cycle that Nest can be talked into resolving is still a cycle, and
 * this one has an obvious leaf to cut out.
 */
@Module({
  providers: [AuthCookies],
  exports: [AuthCookies],
})
export class AuthCookiesModule {}
