import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'

import type { Env } from '../config/env'
import type { AuditPartitionService } from './audit-partition.service'
import { MaintenanceScheduler } from './maintenance.scheduler'
import type { RetentionService } from './retention.service'

/**
 * `JOBS_ENABLED` is read once per process and checked inside each cron, so a
 * regression here is silent in both directions: jobs that stop deleting
 * personal data on the deployment that matters, or two developers on a shared
 * database both sweeping it.
 */
const schedulerWith = (enabled: boolean) => {
  const retention = { run: vi.fn(async () => {}) }
  const auditPartitions = { run: vi.fn(async () => {}) }
  const scheduler = new MaintenanceScheduler(
    { get: () => enabled } as unknown as ConfigService<Env, true>,
    retention as unknown as RetentionService,
    auditPartitions as unknown as AuditPartitionService,
  )

  return { scheduler, retention, auditPartitions }
}

describe('MaintenanceScheduler', () => {
  it('runs both jobs when they are enabled', async () => {
    const { scheduler, retention, auditPartitions } = schedulerWith(true)

    await scheduler.ensureAuditPartitions()
    await scheduler.sweepRetention()

    expect(auditPartitions.run).toHaveBeenCalledOnce()
    expect(retention.run).toHaveBeenCalledOnce()
  })

  it('runs neither when they are not', async () => {
    const { scheduler, retention, auditPartitions } = schedulerWith(false)

    await scheduler.ensureAuditPartitions()
    await scheduler.sweepRetention()

    expect(auditPartitions.run).not.toHaveBeenCalled()
    expect(retention.run).not.toHaveBeenCalled()
  })

  it('says so at startup, since nothing else would show it', () => {
    const { scheduler } = schedulerWith(false)
    const warn = vi.spyOn(scheduler['logger'], 'warn')

    scheduler.onModuleInit()

    expect(warn).toHaveBeenCalled()
  })
})
