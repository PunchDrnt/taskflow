import { Module } from '@nestjs/common'

import { provideOrgRepository } from '#shared/org-scope/org-repository.provider'

import { OrganizationMember } from './member.entity'
import { MembershipService } from './membership.service'

/**
 * Organisations, their members and their teams. Only membership exists so far
 * — it is what auth needs to answer "which org is this request for".
 */
@Module({
  providers: [provideOrgRepository(OrganizationMember), MembershipService],
  exports: [MembershipService],
})
export class OrganizationModule {}
