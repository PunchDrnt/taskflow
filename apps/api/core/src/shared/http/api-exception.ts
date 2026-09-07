import { HttpException, HttpStatus } from '@nestjs/common'

import { API_ERROR_CODES, type ApiErrorBody } from '@repo/shared'

/**
 * An error with a `code` the client can branch on, rendered by
 * `ApiExceptionFilter` into the shape docs/01-architecture.md#api fixes.
 *
 * Extends `HttpException` rather than `Error` for a reason that is easy to
 * miss: `SentryGlobalFilter` reports anything that is *not* an `HttpException`
 * as an unhandled error. A plain `Error` subclass here would page someone every
 * time a user typed a bad email address.
 */
export class ApiException extends HttpException {
  readonly code: string
  readonly details?: unknown

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    // The full body goes into the HttpException response, so the filter reads
    // it back rather than reassembling it from the parts.
    const body: ApiErrorBody = { statusCode: status, code, message, details }
    super(body, status)

    this.code = code
    this.details = details
  }

  /** Not signed in, or the session is no longer good. */
  static unauthenticated(
    message = 'กรุณาเข้าสู่ระบบ',
    details?: unknown,
  ): ApiException {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      API_ERROR_CODES.UNAUTHENTICATED,
      message,
      details,
    )
  }

  /** Signed in, but not allowed to do this. */
  static forbidden(
    message = 'ไม่มีสิทธิ์ดำเนินการนี้',
    details?: unknown,
  ): ApiException {
    return new ApiException(
      HttpStatus.FORBIDDEN,
      API_ERROR_CODES.FORBIDDEN,
      message,
      details,
    )
  }

  /**
   * No such row. Also the right answer for a row in another org — 404 rather
   * than 403, so the response does not confirm that it exists somewhere.
   */
  static notFound(message = 'ไม่พบข้อมูล', details?: unknown): ApiException {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      API_ERROR_CODES.NOT_FOUND,
      message,
      details,
    )
  }

  /**
   * The request itself is malformed, in a way no schema caught — a cursor
   * somebody truncated when they pasted the URL, and its kind. `VALIDATION_FAILED`
   * so the client branches the same way it does for a rejected body.
   */
  static badRequest(
    message = 'คำขอไม่ถูกต้อง',
    details?: unknown,
  ): ApiException {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      API_ERROR_CODES.VALIDATION_FAILED,
      message,
      details,
    )
  }
}
