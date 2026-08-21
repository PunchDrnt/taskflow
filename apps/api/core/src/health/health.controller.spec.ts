import type {
  HealthCheckService,
  HealthIndicatorService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StorageService } from '../modules/storage/storage.service'
import { HealthController } from './health.controller'

/**
 * The rule worth a test is not that the endpoints answer — it is which
 * indicators each one is allowed to run. A dependency check in liveness
 * restarts the container over a blip that only warranted taking the instance
 * out of rotation, and the mistake is one line in the wrong array.
 */
describe('HealthController', () => {
  const pingCheck = vi.fn(async () => ({ database: { status: 'up' } }))
  const isReachable = vi.fn(async () => true)
  const checkHeap = vi.fn(async () => ({ memory_heap: { status: 'up' } }))
  const checkRSS = vi.fn(async () => ({ memory_rss: { status: 'up' } }))

  // Runs the indicators it is handed, which is what makes "was it called?"
  // mean "is it in this endpoint's list".
  const health = {
    check: async (indicators: (() => unknown)[]) => {
      for (const indicator of indicators) await indicator()
      return { status: 'ok' }
    },
  } as unknown as HealthCheckService

  const controller = new HealthController(
    health,
    { checkHeap, checkRSS } as unknown as MemoryHealthIndicator,
    { pingCheck } as unknown as TypeOrmHealthIndicator,
    { isReachable } as unknown as StorageService,
    {
      check: () => ({ up: () => ({}), down: () => ({}) }),
    } as unknown as HealthIndicatorService,
  )

  beforeEach(() => {
    pingCheck.mockClear()
    isReachable.mockClear()
    checkHeap.mockClear()
    checkRSS.mockClear()
  })

  it('asks nothing outside the process for liveness', async () => {
    await controller.live()

    expect(pingCheck).not.toHaveBeenCalled()
    expect(isReachable).not.toHaveBeenCalled()
  })

  it('asks every dependency for readiness', async () => {
    await controller.ready()

    expect(pingCheck).toHaveBeenCalled()
    expect(isReachable).toHaveBeenCalled()
  })
})
