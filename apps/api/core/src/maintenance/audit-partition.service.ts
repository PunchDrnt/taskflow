import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { LOCK_KEYS, withAdvisoryLock } from './advisory-lock'

/**
 * How far ahead partitions are kept.
 *
 * `004 CreateAuditLogs` creates the same twelve at migration time and spells
 * its own number out, for the same reason the task-depth CHECK does: a
 * migration that changes meaning when someone edits a constant is not a record
 * of what was done. Here the number only has to be large enough that a job
 * stopped for months still has somewhere to write.
 */
const MONTHS_AHEAD = 12

/**
 * Keeps `audit.logs` supplied with partitions to write into.
 *
 * Audit rows are written in the same transaction as the business logic they
 * describe, so a month with no partition does not merely lose a log entry — it
 * fails the user's operation. `audit.logs_default` exists to make that
 * survivable, and this job exists so it is never needed.
 *
 * See .claude/docs/01-architecture.md#retention--each-kind-of-data-has-its-own-lifetime
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
        // Checked first: a row sitting in the default partition is what stops
        // the month it belongs to from being created, so it explains any
        // failure that follows rather than being buried under it.
        await this.reportDefaultPartitionRows()
        await this.ensureUpcomingPartitions()
      },
    )

    if (!attempt.ran) {
      this.logger.debug('Partition upkeep already running elsewhere; skipped')
    }
  }

  /**
   * Creates any of the next twelve months that does not exist yet, and returns
   * the ones this run had to create.
   *
   * The arithmetic lives in `audit.ensure_month_partition`, which is
   * idempotent — the job's whole task is deciding *when*, not reproducing the
   * naming and boundary rules in a second language.
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
   * Logs at error level while `audit.logs_default` holds anything.
   *
   * This is the alert, and it stays one until Sentry is wired up in Phase 0 §7.
   * Rows here mean a partition was missing when they were written, and they
   * also mean the partition for their month cannot be created until they are
   * moved out — Postgres has to prove no default row belongs in the new range.
   */
  async reportDefaultPartitionRows(): Promise<number> {
    const [{ count }] = (await this.dataSource.query(
      `SELECT count(*)::int AS count FROM audit.logs_default`,
    )) as { count: number }[]

    if (count > 0) {
      this.logger.error(
        { rows: count },
        'audit.logs_default is not empty: rows were written with no partition ' +
          'to hold them, and the months they belong to cannot be created ' +
          'until they are moved out',
      )
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
