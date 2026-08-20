import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'

import type { Env } from '../config/env'
import { AuditPartitionService } from './audit-partition.service'
import { RetentionService } from './retention.service'

/**
 * When the maintenance jobs run.
 *
 * Kept apart from the services that do the work so that "what retention does"
 * and "when it happens" are separate questions — and so tests can call the
 * services directly without a scheduler in the way.
 *
 * The time zone is named rather than inherited from the host. The deployment
 * is in Thailand and the intent is "the quiet part of the night there", which
 * a container running on UTC would otherwise turn into the middle of the
 * working day.
 */
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

  // Partitions first, and a few minutes clear of retention: the two touch
  // different tables, but a partition that fails to appear is the more urgent
  // of the two to see in the logs.
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
