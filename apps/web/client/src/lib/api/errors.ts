import { isAxiosError } from 'axios'

import { API_ERROR_CODES, type ApiErrorBody } from '@repo/shared'

/**
 * Every failure from the API, in one shape, whatever went wrong.
 *
 * The alternative is each call site asking `error.response?.data?.code` and
 * getting `undefined` when the request never reached the server at all —
 * which reads exactly like a successful response with no code, and is the
 * reason `isNetworkFailure` is a field rather than something to infer.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown
  /** True when nothing came back: DNS, connection refused, timeout, abort. */
  readonly isNetworkFailure: boolean

  constructor(init: {
    status: number
    code: string
    message: string
    details?: unknown
    isNetworkFailure?: boolean
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.details = init.details
    this.isNetworkFailure = init.isNetworkFailure ?? false
  }
}

/**
 * Anything thrown by axios, rendered as an `ApiError`.
 *
 * A response body is trusted only after it is checked for the two fields that
 * make it ours — a 502 from a proxy is HTML, and reading `.code` off it would
 * put a fragment of somebody else's error page on the screen.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (isAxiosError(error)) {
    const body = error.response?.data as unknown

    if (isApiErrorBody(body)) {
      return new ApiError({
        status: error.response?.status ?? body.statusCode,
        code: body.code,
        message: body.message,
        details: body.details,
      })
    }

    if (error.response !== undefined) {
      return new ApiError({
        status: error.response.status,
        code: `HTTP_${error.response.status}`,
        message: 'The server responded with an error',
      })
    }

    return new ApiError({
      status: 0,
      code: API_ERROR_CODES.INTERNAL_ERROR,
      message: 'Could not reach the server',
      isNetworkFailure: true,
    })
  }

  return new ApiError({
    status: 0,
    code: API_ERROR_CODES.INTERNAL_ERROR,
    message: error instanceof Error ? error.message : 'Something went wrong',
  })
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  if (typeof body !== 'object' || body === null) return false

  const candidate = body as Partial<ApiErrorBody>

  return (
    typeof candidate.code === 'string' && typeof candidate.message === 'string'
  )
}

/**
 * "This session is over" — the only condition a refresh can fix, and the only
 * one worth retrying a request for.
 */
export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}
