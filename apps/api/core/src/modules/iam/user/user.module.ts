import { Module } from '@nestjs/common'

import { provideOrgRepository } from '#shared/org-scope/org-repository.provider'

import { User } from './user.entity'
import { UserService } from './user.service'

/**
 * Exports the service, never the entity — see UserService.
 *
 * No controllers: every `/me` route lives in `AuthModule`, because each of
 * them needs something from it and the reverse import would be a cycle.
 */
@Module({
  providers: [provideOrgRepository(User), UserService],
  exports: [UserService],
})
export class UserModule {}
