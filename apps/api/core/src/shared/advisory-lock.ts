import type { DataSource } from 'typeorm'

/**
 * Runs `work` only if no other process is already running it — cron is
 * declared per process, so two containers fire the same job on the same
 * second.
 *
 * `try` rather than plain `pg_advisory_lock`: by the time the lock frees up
 * the work is done, so the second caller should skip, not queue.
 *
 * Session-scoped locks have to be taken and released on one connection, and
 * `dataSource.query()` picks whichever pool member is free — hence the
 * reserved QueryRunner.
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
 * One key per job. The namespace is database-wide, so these avoid 1 and 2 to
 * stay clear of anything else that ever takes a lock.
 *
 * Held here rather than in `maintenance/` because the outbox worker takes one
 * too, and a module reaching into the job directory to borrow a lock is the
 * kind of import that turns a boundary into a suggestion.
 */
export const LOCK_KEYS = {
  retention: 8_147_001,
  auditPartition: 8_147_002,
  outbox: 8_147_003,
} as const
