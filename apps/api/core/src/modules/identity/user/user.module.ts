import { Module } from '@nestjs/common'

import { provideOrgRepository } from '#shared/org-scope/org-repository.provider'

import { OrganizationModule } from '../../organization/organization.module'
import { AuthCookiesModule } from '../auth/auth-cookies.module'
import { MeController } from './me.controller'
import { User } from './user.entity'
import { UserService } from './user.service'

/** Exports the service, never the entity — see UserService. */
@Module({
  imports: [OrganizationModule, AuthCookiesModule],
  controllers: [MeController],
  providers: [provideOrgRepository(User), UserService],
  exports: [UserService],
})
export class UserModule {}
