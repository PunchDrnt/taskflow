import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common'
import type { Response } from 'express'

import { API_ERROR_CODES, type ApiErrorBody } from '@repo/shared'

/**
 * Renders every `HttpException` as the body docs/01-architecture.md#api fixes:
 * `{ statusCode, code, message, details? }`.
 *
 * `@Catch(HttpException)` and not `@Catch()`, which is the load-bearing part.
 * Everything else — a TypeError, a dropped database connection — falls through
 * to `SentryGlobalFilter`, which reports it and renders Nest's default 500.
 * Catching it here instead would silence Sentry: its filter only reports what
 * reaches it, and there is no way to hand an exception back to the next filter
 * once one has answered. So the trade is deliberate — a 500 body carries no
 * `code`, and in exchange unexpected errors still reach Sentry.
 *
 * Nest's own exceptions (`NotFoundException` for an unmatched route, the 401 a
 * guard throws) come through here too, so they get a `code` rather than a
 * second, undocumented shape. **Those are the ones that depend on this filter
 * being tried before `SentryGlobalFilter`**, and the whole reason the
 * registration order in `app.module.ts` is pinned by a test: `APP_FILTER` is
 * applied in reverse, so the one registered last runs first.
 *
 * An `ApiException` is the exception to that, and measuring it is what made
 * the rule clear: it stores its finished body as the `HttpException` payload,
 * so Nest's default renderer emits the documented shape whether this filter
 * ran or not. Convenient, and not something to rely on — it holds only for the
 * errors this codebase raises deliberately.
 */
@Catch(HttpException)
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()
    const status = exception.getStatus()

    response.status(status).json(bodyFor(exception, status))
  }
}

function bodyFor(exception: HttpException, status: number): ApiErrorBody {
  const payload: unknown = exception.getResponse()

  // ApiException put the finished body here on the way in.
  if (isApiErrorBody(payload)) return payload

  return {
    statusCode: status,
    code: codeFor(status),
    message: messageFor(payload, status),
  }
}

function isApiErrorBody(payload: unknown): payload is ApiErrorBody {
  if (typeof payload !== 'object' || payload === null) return false

  const candidate = payload as Partial<ApiErrorBody>
  return (
    typeof candidate.code === 'string' && typeof candidate.message === 'string'
  )
}

/**
 * A code for the exceptions Nest raises itself, which carry none. Named for
 * the statuses the spec's table gives a meaning to; anything else falls back to
 * the status, so a new one is legible rather than mislabelled as something it
 * is not.
 */
function codeFor(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return API_ERROR_CODES.UNAUTHENTICATED
    case HttpStatus.FORBIDDEN:
      return API_ERROR_CODES.FORBIDDEN
    case HttpStatus.NOT_FOUND:
      return API_ERROR_CODES.NOT_FOUND
    default:
      return `HTTP_${status}`
  }
}

/**
 * Nest's payload is either a string or `{ message, error }`, and `message` is
 * an array when a pipe reported several problems. A 5xx message is dropped
 * rather than shown: it is written for a log, not for a user.
 */
function messageFor(payload: unknown, status: number): string {
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
    return 'Something went wrong'
  }

  if (typeof payload === 'string') return payload

  if (typeof payload === 'object' && payload !== null) {
    const { message } = payload as { message?: unknown }

    if (typeof message === 'string') return message
    if (Array.isArray(message)) return message.map(String).join(', ')
  }

  return 'Bad request'
}
