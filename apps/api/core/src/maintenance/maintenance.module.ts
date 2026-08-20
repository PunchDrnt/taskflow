import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'

import { AuditPartitionService } from './audit-partition.service'
import { MaintenanceScheduler } from './maintenance.scheduler'
import { RetentionService } from './retention.service'

/**
 * The jobs nobody triggers: retention and audit-log partition upkeep.
 *
 * A top-level module rather than one under `src/modules/`, because those are
 * the domain modules — one per schema, each holding entities and a service
 * that may only see its own org. Everything here deliberately crosses orgs and
 * talks to the database in raw SQL, which is also why the ESLint rule banning
 * a plain `Repository` under `src/modules/**` does not reach it.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [RetentionService, AuditPartitionService, MaintenanceScheduler],
  exports: [RetentionService, AuditPartitionService],
})
export class MaintenanceModule {}
