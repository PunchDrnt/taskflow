import * as Sentry from '@sentry/nestjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { alertsFor } from './alert'

/**
 * The failure mode these guard against is their own silence: a job alert that
 * reports nowhere looks identical to a job that never failed.
 */
interface Captured {
  message?: string
  value?: string
  tags?: Record<string, unknown>
  extra?: Record<string, unknown>
}

const captured: Captured[] = []

beforeAll(() => {
  Sentry.init({
    dsn: 'http://probe@127.0.0.1:1/1',
    // Collect instead of send. Returning null drops the event, so the fake
    // DSN above is never dialled.
    beforeSend: (event) => {
      captured.push({
        message: event.message,
        value: event.exception?.values?.[0]?.value,
        tags: event.tags,
        extra: event.extra,
      })
      return null
    },
  })
})

afterAll(async () => {
  await Sentry.close(0)
})

describe('alerts', () => {
  const maintenance = alertsFor('maintenance')

  it('reports a step that threw, with what it was doing', async () => {
    maintenance.failure(new Error('purge-blocked-by-fk'), {
      step: 'softDeleted',
    })
    await Sentry.flush(2000)

    const event = captured.find((e) => e.value === 'purge-blocked-by-fk')
    expect(event).toBeDefined()
    expect(event?.extra).toMatchObject({ step: 'softDeleted' })
    expect(event?.tags).toMatchObject({ area: 'maintenance' })
  })

  it('reports a wrong state that threw nothing', async () => {
    // audit.logs_default holding rows is not an exception anywhere — there is
    // no Error to capture, only a count that should be zero.
    maintenance.condition('audit.logs_default is not empty', { rows: 12 })
    await Sentry.flush(2000)

    const event = captured.find(
      (e) => e.message === 'audit.logs_default is not empty',
    )
    expect(event).toBeDefined()
    expect(event?.extra).toMatchObject({ rows: 12 })
  })

  it('tags each area separately, so one alert rule cannot catch both', async () => {
    alertsFor('notify').failure(new Error('resend-refused'), { outboxId: 'x' })
    await Sentry.flush(2000)

    const event = captured.find((e) => e.value === 'resend-refused')
    expect(event?.tags).toMatchObject({ area: 'notify' })
  })
})
