import { Module } from '@nestjs/common'

import { provideOrgRepository } from '#shared/org-scope/org-repository.provider'

import { AuditModule } from '../audit/audit.module'
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
 * "which org is this request for" before any context exists. Nothing else
 * here is exported: member management is reached through this module's own
 * controller.
 */
@Module({
  imports: [AuditModule, UserModule],
  controllers: [OrganizationController],
  providers: [
    provideOrgRepository(OrganizationMember),
    provideOrgRepository(Organization, 'id'),
    MembershipService,
    MemberService,
    OrganizationService,
  ],
  exports: [MembershipService],
})
export class OrganizationModule {}
