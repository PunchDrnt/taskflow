import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common'
import type { ZodError, ZodType } from 'zod'

import { API_ERROR_CODES, type ValidationIssue } from '@repo/shared'

import { ApiException } from './api-exception'

/**
 * Validates a body, query or param against a zod schema, and hands the handler
 * the *parsed* value — so `email` arrives trimmed and lower-cased, and a
 * coerced number arrives as a number.
 *
 * Per-route rather than global: a global pipe has no schema to apply, and
 * `@Body(new ZodValidationPipe(loginSchema))` keeps the schema visible at the
 * route it guards. Schemas live in `@repo/shared` so the web client validates
 * against the same object rather than a copy of it.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value)

    if (result.success) return result.data

    // Converted here rather than letting the ZodError escape. Sentry's filter
    // treats anything that is not an HttpException as unhandled, so a raw
    // ZodError would both page someone and render a 500 — for a typo in an
    // email field. Measured against @sentry/nestjs's isExpectedError.
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      API_ERROR_CODES.VALIDATION_FAILED,
      'The submitted data is not valid',
      issuesOf(result.error),
    )
  }
}

/**
 * Zod's issues, flattened to what a form needs: which field, and what to say
 * under it. The rest of a ZodIssue describes the schema rather than the
 * mistake, and echoing it back tells a caller how validation is built.
 */
function issuesOf(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    // Array indices arrive as numbers: `items.0.title`.
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }))
}
