import { z } from 'zod'

/**
 * An id in the shape this system's `uuid` columns actually hold.
 *
 * `z.guid()` and not `z.uuid()`: since zod 4 the latter also asserts the RFC
 * 9562 version and variant nibbles, a rule neither Postgres's `uuid` type nor
 * this codebase keeps. Two ids that exist today fail it — `SYSTEM_USER_ID` is
 * the nil UUID and sits in the `created_by` of every row the system writes,
 * and the demo seed uses readable ids like `1111…-1111` so a person can
 * recognise them in a log. Both store without complaint, so validating the
 * stricter rule at the edge rejects ids the database itself handed out.
 *
 * Measured 2026-09-04 against zod 4.4.3, after `POST /v1/me/active-org`
 * answered `VALIDATION_FAILED` for the seeded org.
 */
export const idSchema = (message: string): z.ZodGUID => z.guid(message)
