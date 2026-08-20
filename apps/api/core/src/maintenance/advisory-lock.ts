import type { DataSource } from 'typeorm'

/**
 * Runs `work` only if no other process is already running it.
 *
 * Scheduled jobs are declared per process, so two API containers both fire the
 * same cron at the same second. For the retention sweep that means two
 * concurrent `DELETE`s racing over the same rows; for the partition job, two
 * `CREATE TABLE`s where the loser gets a duplicate-object error at 03:05 that
 * nobody is awake to read. A lock the database hands out means the second
 * process simply does nothing.
 *
 * `pg_try_advisory_lock` rather than `pg_advisory_lock`: a job that is already
 * running should be skipped, not queued behind the one that is running — by
 * the time the lock is free, the work is done.
 *
 * The lock is session-scoped, so it has to be taken and released on one
 * connection. `dataSource.query()` picks whichever pool member is free, which
 * would take the lock on one connection and try to release it on another, so
 * this reserves a QueryRunner for the duration.
 */
export async function withAdvisoryLock<T>(
  dataSource: DataSource,
  key: number,
  work: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false; result?: undefined }> {
  const runner = dataSource.createQueryRunner()
  await runner.connect()

  try {
    const [{ locked }] = (await runner.query(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [key],
    )) as { locked: boolean }[]

    if (!locked) return { ran: false }

    try {
      return { ran: true, result: await work() }
    } finally {
      await runner.query('SELECT pg_advisory_unlock($1)', [key])
    }
  } finally {
    await runner.release()
  }
}

/**
 * One number per job. Advisory locks share a single namespace across the whole
 * database, so these have to be unique among themselves and unlikely to
 * collide with anything else that ever takes one — hence the arbitrary but
 * distinctive prefix rather than 1 and 2.
 */
export const LOCK_KEYS = {
  retention: 8_147_001,
  auditPartition: 8_147_002,
} as const
