import { Module } from '@nestjs/common'

import { PasswordService } from './password.service'

/**
 * `PasswordService` alone, so `OrganizationModule` can hash the initial
 * password when an admin adds a colleague, without importing `AuthModule` —
 * which imports `OrganizationModule` right back for `MembershipService`.
 *
 * The same cut `AuthCookiesModule` makes, for the same reason and with an even
 * clearer leaf: this service has no dependencies at all, no database and no
 * request context.
 */
@Module({
  providers: [PasswordService],
  exports: [PasswordService],
})
export class PasswordModule {}
