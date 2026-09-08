import {
  Controller,
  Get,
  HttpStatus,
  Module,
  Query,
  type INestApplication,
} from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { SentryGlobalFilter } from '@sentry/nestjs/setup'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { emailSchema } from '@repo/shared'

import { ApiException } from './api-exception'
import { ApiExceptionFilter } from './api-exception.filter'
import { ZodValidationPipe } from './zod-validation.pipe'

// The real schema, so the transform assertion below exercises what production
// uses rather than a copy that happens to agree with it today.
const schema = z.object({ email: emailSchema })

@Controller('errors')
class ErrorsController {
  @Get('api-exception')
  apiException(): never {
    throw new ApiException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'STATUS_IN_USE',
      'Cannot delete: tasks are still using this status',
      { taskCount: 12 },
    )
  }

  @Get('unauthenticated')
  unauthenticated(): never {
    throw ApiException.unauthenticated()
  }

  @Get('validated')
  validated(@Query(new ZodValidationPipe(schema)) query: unknown): unknown {
    return query
  }

  @Get('unexpected')
  unexpected(): never {
    // Not an HttpException: the case that must reach Sentry rather than stop
    // at ApiExceptionFilter.
    throw new TypeError('a bug, not an answer')
  }
}

@Module({
  controllers: [ErrorsController],
  providers: [
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
class ErrorsModule {}

describe('ApiExceptionFilter', () => {
  let app: INestApplication
  let origin: string

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ErrorsModule],
    }).compile()

    app = moduleRef.createNestApplication()
    // Port 0: the OS picks a free one, so a suite running beside another does
    // not fight over a fixed port.
    await app.listen(0)
    origin = await app.getUrl()
  })

  afterAll(async () => {
    await app.close()
  })

  const get = async (
    path: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
    const response = await fetch(`${origin}${path}`)
    const body = (await response.json()) as Record<string, unknown>

    return { status: response.status, body }
  }

  it('renders an ApiException as the documented shape', async () => {
    const { status, body } = await get('/errors/api-exception')

    expect(status).toBe(422)
    expect(body).toEqual({
      statusCode: 422,
      code: 'STATUS_IN_USE',
      message: 'Cannot delete: tasks are still using this status',
      details: { taskCount: 12 },
    })
  })

  it('omits details rather than sending null when there are none', async () => {
    const { status, body } = await get('/errors/unauthenticated')

    expect(status).toBe(401)
    expect(body).toEqual({
      statusCode: 401,
      code: 'UNAUTHENTICATED',
      message: 'Please sign in',
    })
    expect('details' in body).toBe(false)
  })

  /**
   * The one assertion that depends on the registration order above, so it is
   * what guards it. APP_FILTER is applied in reverse — last registered, first
   * tried — and SentryGlobalFilter is @Catch(), so swapping the two lets it
   * answer first and this 404 comes back without a `code`. Verified by
   * swapping them; the other cases here pass either way, because an
   * ApiException carries its own finished body.
   */
  it('gives Nest its own exceptions a code, so 404 has one shape', async () => {
    const { status, body } = await get('/errors/no-such-route')

    expect(status).toBe(404)
    expect(body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('reports a failed schema as 400 with the failing paths', async () => {
    const { status, body } = await get('/errors/validated?email=nope')

    expect(status).toBe(400)
    expect(body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      details: [{ path: 'email', message: 'Enter a valid email address' }],
    })
  })

  it('hands the handler the parsed value, not the raw one', async () => {
    const response = await fetch(`${origin}/errors/validated?email=A@X.COM`)

    // emailSchema lower-cases; this proves transform output reaches the route
    // rather than the pipe merely approving the input.
    expect(await response.json()).toEqual({ email: 'a@x.com' })
  })

  /**
   * ApiExceptionFilter is @Catch(HttpException), so an unexpected error falls
   * past it to SentryGlobalFilter, which reports it and renders Nest's default
   * 500. A `code` here would mean ApiExceptionFilter had widened to @Catch()
   * and silenced Sentry — the failure this asserts against is silent
   * otherwise, exactly like the ./instrument import.
   */
  it('lets an unexpected error fall through to Sentry', async () => {
    const { status, body } = await get('/errors/unexpected')

    expect(status).toBe(500)
    expect(body).not.toHaveProperty('code')
  })
})
