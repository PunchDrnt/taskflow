import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { LOCK_KEYS, withAdvisoryLock } from '../shared/advisory-lock'
import { alertsFor } from '../shared/alert'

const alerts = alertsFor('maintenance')

/** Large enough that a job stopped for months still has somewhere to write. */
const MONTHS_AHEAD = 12

/**
 * Keeps `audit.logs` supplied with partitions to write into.
 *
 * Audit rows are written in the same transaction as the business logic, so a
 * month with no partition fails the user's operation rather than just losing a
 * log entry. `audit.logs_default` makes that survivable; this job means it is
 * never needed.
 */
@Injectable()
export class AuditPartitionService {
  private readonly logger = new Logger(AuditPartitionService.name)

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async run(): Promise<void> {
    const attempt = await withAdvisoryLock(
      this.dataSource,
      LOCK_KEYS.auditPartition,
      async () => {
        // First, because a stranded default row is what stops its month from
        // being created — it explains any failure that follows.
        await this.reportDefaultPartitionRows()
        await this.ensureUpcomingPartitions()
      },
    )

    if (!attempt.ran) {
      this.logger.debug('Partition upkeep already running elsewhere; skipped')
    }
  }

  /**
   * Creates any of the next twelve months that is missing, and returns them.
   * The naming and boundary arithmetic stays in
   * `audit.ensure_month_partition` rather than being restated in TypeScript.
   */
  async ensureUpcomingPartitions(): Promise<string[]> {
    const created: string[] = []

    for (let offset = 0; offset < MONTHS_AHEAD; offset += 1) {
      const existed = await this.partitionExists(offset)
      if (existed) continue

      const [{ partition }] = (await this.dataSource.query(
        `SELECT audit.ensure_month_partition(
           (date_trunc('month', now()) + make_interval(months => $1))::date
         ) AS partition`,
        [offset],
      )) as { partition: string }[]

      created.push(partition)
    }

    if (created.length > 0) {
      this.logger.log({ created }, 'Created audit log partitions')
    }

    return created
  }

  /**
   * Rows here mean a partition was missing when they were written, and that
   * the months they belong to cannot be created until they are moved out.
   */
  async reportDefaultPartitionRows(): Promise<number> {
    const [{ count }] = (await this.dataSource.query(
      `SELECT count(*)::int AS count FROM audit.logs_default`,
    )) as { count: number }[]

    if (count > 0) {
      const message =
        'audit.logs_default is not empty: rows were written with no partition ' +
        'to hold them, and the months they belong to cannot be created ' +
        'until they are moved out'

      this.logger.error({ rows: count }, message)
      alerts.condition(message, { rows: count })
    }

    return count
  }

  private async partitionExists(monthsAhead: number): Promise<boolean> {
    const [{ exists }] = (await this.dataSource.query(
      `SELECT to_regclass(
         'audit.logs_' || to_char(
           date_trunc('month', now()) + make_interval(months => $1), 'YYYY_MM'
         )
       ) IS NOT NULL AS exists`,
      [monthsAhead],
    )) as { exists: boolean }[]

    return exists
  }
}
