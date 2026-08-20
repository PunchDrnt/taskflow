import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'

import { AuditPartitionService } from './audit-partition.service'
import { MaintenanceScheduler } from './maintenance.scheduler'
import { RetentionService } from './retention.service'

/**
 * The jobs nobody triggers.
 *
 * Deliberately outside `src/modules/`: everything here crosses orgs in raw
 * SQL, which is the opposite of what a domain module is allowed to do.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [RetentionService, AuditPartitionService, MaintenanceScheduler],
  exports: [RetentionService, AuditPartitionService],
})
export class MaintenanceModule {}
