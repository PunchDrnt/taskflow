import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'

import type { Env } from '../config/env'
import { AuditPartitionService } from './audit-partition.service'
import { RetentionService } from './retention.service'

/** Named, not inherited from the host: on a UTC container 03:00 is midday. */
const TIME_ZONE = 'Asia/Bangkok'

@Injectable()
export class MaintenanceScheduler implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceScheduler.name)
  private readonly enabled: boolean

  constructor(
    config: ConfigService<Env, true>,
    private readonly retention: RetentionService,
    private readonly auditPartitions: AuditPartitionService,
  ) {
    this.enabled = config.get('JOBS_ENABLED', { infer: true })
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.warn(
        'JOBS_ENABLED is false: retention and partition upkeep will not run ' +
          'in this process',
      )
    }
  }

  // Ten minutes ahead of retention: a missing partition is the more urgent of
  // the two to find in the logs.
  @Cron('5 3 * * *', { name: 'audit-partitions', timeZone: TIME_ZONE })
  async ensureAuditPartitions(): Promise<void> {
    if (!this.enabled) return
    await this.auditPartitions.run()
  }

  @Cron('15 3 * * *', { name: 'retention', timeZone: TIME_ZONE })
  async sweepRetention(): Promise<void> {
    if (!this.enabled) return
    await this.retention.run()
  }
}
