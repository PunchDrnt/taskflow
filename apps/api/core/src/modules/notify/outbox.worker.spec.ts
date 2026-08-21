import type { ConfigService } from '@nestjs/config'
import type { DataSource } from 'typeorm'
import { describe, expect, it, vi } from 'vitest'

import type { Env } from '../../config/env'
import type { EmailTransport } from './email.transport'
import { OutboxWorker } from './outbox.worker'

describe('OutboxWorker and JOBS_ENABLED', () => {
  const workerWith = (enabled: boolean) => {
    // Reaching the database at all means the flag was not honoured: tick()
    // takes an advisory lock before it looks at anything.
    const createQueryRunner = vi.fn()
    const worker = new OutboxWorker(
      { createQueryRunner } as unknown as DataSource,
      { send: vi.fn() } as unknown as EmailTransport,
      { get: () => enabled } as unknown as ConfigService<Env, true>,
    )

    return { worker, createQueryRunner }
  }

  it('does not touch the database when jobs are off', async () => {
    const { worker, createQueryRunner } = workerWith(false)

    await worker.tick()

    expect(createQueryRunner).not.toHaveBeenCalled()
  })

  it('goes for the lock when they are on', async () => {
    const { worker, createQueryRunner } = workerWith(true)

    await worker.tick().catch(() => {
      // The fake runner cannot answer; that it was asked for is the assertion.
    })

    expect(createQueryRunner).toHaveBeenCalled()
  })
})
