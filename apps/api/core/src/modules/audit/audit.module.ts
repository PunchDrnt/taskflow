import { Module } from '@nestjs/common'

import { provideOrgRepository } from '../../shared/org-repository.provider'
import { AuditService } from './audit.service'
import { AuditLog } from './log.entity'

/**
 * Exports the service and nothing else — a module that wants the activity log
 * asks AuditService for it and never sees the table.
 */
@Module({
  providers: [provideOrgRepository(AuditLog), AuditService],
  exports: [AuditService],
})
export class AuditModule {}
