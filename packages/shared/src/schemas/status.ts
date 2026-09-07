import { z } from 'zod'

import { idSchema } from './id.js'
import { paletteColorSchema } from './project.js'

/** Codes the client branches on, beside the module that raises them. */
export const STATUS_ERROR_CODES = {
  /** Another live status in this project already has this name. */
  NAME_TAKEN: 'STATUS_NAME_TAKEN',
  /** The project would be left with no statuses at all. */
  LAST_STATUS: 'LAST_STATUS',
  /** The project would be left with nothing that counts as finished. */
  LAST_DONE_STATUS: 'LAST_DONE_STATUS',
  /** The project would be left with no status for new tasks to start in. */
  LAST_DEFAULT_STATUS: 'LAST_DEFAULT_STATUS',
  /** Tasks are still in it. */
  STATUS_IN_USE: 'STATUS_IN_USE',
} as const

/**
 * What a status *counts as*, as one choice rather than two booleans.
 *
 * The database stores `is_done_type` and `is_cancelled_type` separately with a
 * CHECK that they are never both true. Exposing them as two flags would let a
 * client send the one combination the CHECK exists to reject, and find out by
 * receiving a 500 — so the API takes the choice the settings screen actually
 * presents ("ปกติ / เสร็จ / ยกเลิก") and the service maps it to the pair.
 *
 * The distinction is not cosmetic. Cancelled work leaves the denominator of a
 * progress bar; done work stays in it. A project with no cancelled status
 * gets abandoned work marked Done instead, and every closed sprint's numbers
 * are wrong from then on.
 */
export const STATUS_KINDS = ['normal', 'done', 'cancelled'] as const

export type StatusKind = (typeof STATUS_KINDS)[number]

export const statusKindSchema = z.enum(
  STATUS_KINDS,
  'ประเภทต้องเป็น normal, done หรือ cancelled',
)

export const statusNameSchema = z
  .string()
  .trim()
  .min(1, 'กรุณากรอกชื่อสถานะ')
  .max(50, 'ชื่อสถานะต้องไม่เกิน 50 ตัวอักษร')

export const createStatusSchema = z.object({
  name: statusNameSchema,
  color: paletteColorSchema,
  kind: statusKindSchema.default('normal'),
})

export type CreateStatusInput = z.infer<typeof createStatusSchema>

/**
 * `afterId` is how a position is expressed — the id of the status this one
 * should sit directly after, or `null` for first.
 *
 * Deliberately not the `sort_order` key itself. The key is fractional-index
 * arithmetic whose correctness depends on reading the current neighbours, and
 * a client that computes one from a stale list writes a row into the wrong
 * place with nothing to indicate it. Naming a neighbour is the part the client
 * actually knows.
 */
export const updateStatusSchema = z
  .object({
    name: statusNameSchema.optional(),
    color: paletteColorSchema.optional(),
    kind: statusKindSchema.optional(),
    /** Only `true` is meaningful: a project always has exactly one default. */
    isDefault: z.literal(true).optional(),
    afterId: idSchema('status id ไม่ถูกต้อง').nullable().optional(),
  })
  .refine(
    (body) => Object.values(body).some((value) => value !== undefined),
    'ต้องระบุอย่างน้อยหนึ่งอย่างที่จะแก้',
  )

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>

export const statusIdSchema = idSchema('status id ไม่ถูกต้อง')
