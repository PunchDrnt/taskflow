import { Module } from '@nestjs/common'

import { provideOrgRepository } from '#shared/org-scope/org-repository.provider'

import { AuditModule } from '../audit/audit.module'
import { PasswordModule } from '../iam/auth/password.module'
import { UserModule } from '../iam/user/user.module'
import { OrganizationMember } from './member.entity'
import { MemberService } from './member.service'
import { MembershipService } from './membership.service'
import { OrganizationController } from './organization.controller'
import { Organization } from './organization.entity'
import { OrganizationService } from './organization.service'

/**
 * Organisations, their members and their teams. Teams are Phase 2; what is
 * here is the org itself and who is in it.
 *
 * `provideOrgRepository(Organization, 'id')` — this is the one table whose
 * scope column is its own primary key, because an `org_id` on it would always
 * equal `id`.
 *
 * `MembershipService` is exported for `AuthModule`, which needs it to answer
 * "which org is this request for" before any context exists.
 *
 * `PasswordModule` is imported rather than `AuthModule`: adding a colleague
 * sets their first password, and `AuthModule` imports *this* module for
 * `MembershipService`. That one leaf has no dependencies of its own.
 *
 * `MemberService` is exported for `ProjectModule`, which has to answer one
 * question about this module's tables and must not read them itself: adding
 * somebody to a project requires that they are in the organisation, and
 * `project.members.user_id` references `iam.users` alone — so nothing in the
 * database stops a person from another company being written in.
 */
@Module({
  imports: [AuditModule, PasswordModule, UserModule],
  controllers: [OrganizationController],
  providers: [
    provideOrgRepository(OrganizationMember),
    provideOrgRepository(Organization, 'id'),
    MembershipService,
    MemberService,
    OrganizationService,
  ],
  exports: [MembershipService, MemberService],
})
export class OrganizationModule {}
