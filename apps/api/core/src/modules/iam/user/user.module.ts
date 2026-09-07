import { Module } from '@nestjs/common'

import { provideOrgRepository } from '#shared/org-scope/org-repository.provider'

import { UserAvatarController } from './user-avatar.controller'
import { User } from './user.entity'
import { UserService } from './user.service'

/**
 * Exports the service, never the entity — see UserService.
 *
 * One controller, and it is not a `/me` route: every one of those lives in
 * `AuthModule`, because each needs something from it and the reverse import
 * would be a cycle. `GET /v1/users/:id/avatar` needs nothing from auth, and
 * it is about a *user* rather than about the caller.
 */
@Module({
  controllers: [UserAvatarController],
  providers: [provideOrgRepository(User), UserService],
  exports: [UserService],
})
export class UserModule {}
