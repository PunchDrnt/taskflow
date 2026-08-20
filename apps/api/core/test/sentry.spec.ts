import type { AddressInfo } from 'node:net'
import { Controller, Get, Module, NotFoundException } from '@nestjs/common'
import { APP_FILTER, NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import * as Sentry from '@sentry/nestjs'
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * That app.module.ts registers SentryGlobalFilter is easy to read and easy to
 * delete. This checks what the registration is for: an error nothing handled
 * is reported, and an HttpException — an ordinary answer — is not.
 *
 * Runs against a real Nest app on a real port, with Sentry's own transport
 * replaced by a collector, so nothing leaves the process.
 */
const captured: string[] = []

@Controller()
class ProbeController {
  @Get('boom')
  boom(): never {
    throw new Error('unhandled-probe-error')
  }

  @Get('missing')
  missing(): never {
    throw new NotFoundException('ordinary-404')
  }
}

@Module({
  imports: [SentryModule.forRoot()],
  controllers: [ProbeController],
  providers: [{ provide: APP_FILTER, useClass: SentryGlobalFilter }],
})
class ProbeModule {}

let app: NestExpressApplication
let origin: string

beforeAll(async () => {
  Sentry.init({
    dsn: 'http://probe@127.0.0.1:1/1',
    // Collect instead of send. Returning null also drops the event, so the
    // fake DSN above is never actually dialled.
    beforeSend: (event) => {
      captured.push(event.exception?.values?.[0]?.value ?? '')
      return null
    },
  })

  app = await NestFactory.create<NestExpressApplication>(ProbeModule, {
    logger: false,
  })
  await app.listen(0)
  const { port } = app.getHttpServer().address() as AddressInfo
  origin = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await app?.close()
  await Sentry.close(0)
})

describe('SentryGlobalFilter', () => {
  it('reports an error nothing else handled', async () => {
    const response = await fetch(`${origin}/boom`)
    expect(response.status).toBe(500)

    await Sentry.flush(2000)
    expect(captured).toContain('unhandled-probe-error')
  })

  it('leaves an HttpException alone', async () => {
    const before = captured.length

    const response = await fetch(`${origin}/missing`)
    expect(response.status).toBe(404)

    await Sentry.flush(2000)
    // A 404 is an answer, not a fault. Reporting them buries the real ones.
    expect(captured.slice(before)).toEqual([])
  })
})
