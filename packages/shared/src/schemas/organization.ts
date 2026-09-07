import { z } from 'zod'

import { ORG_ROLES } from '../constants.js'
import { idSchema } from './id.js'

/**
 * Codes the client branches on, kept with the module that raises them rather
 * than in `API_ERROR_CODES` — collecting every code in one file would make
 * that file something every module has to edit.
 */
export const ORGANIZATION_ERROR_CODES = {
  /** The change would leave the organisation with no owner. */
  LAST_OWNER: 'LAST_OWNER',
  /** Another live organisation already uses this slug. */
  SLUG_TAKEN: 'SLUG_TAKEN',
} as const

/**
 * A slug is what an organisation is called in a URL, so it is deliberately
 * narrower than a name: lowercase, digits and single hyphens, never leading
 * or trailing. Nothing in the docs fixed the shape — this is the decision,
 * and it is the smallest one that keeps a slug readable and unambiguous in a
 * path segment.
 *
 * Uniqueness is a partial index (`WHERE deleted_at IS NULL`), so a deleted
 * organisation releases its slug and a live one holds it.
 */
export const orgSlugSchema = z
  .string()
  .min(2, 'slug ต้องยาวอย่างน้อย 2 ตัวอักษร')
  .max(50, 'slug ต้องไม่เกิน 50 ตัวอักษร')
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    'slug ใช้ได้เฉพาะ a-z, 0-9 และ - โดยห้ามขึ้นต้นหรือลงท้ายด้วย -',
  )

export const orgNameSchema = z
  .string()
  .trim()
  .min(1, 'กรุณากรอกชื่อองค์กร')
  .max(100, 'ชื่อองค์กรต้องไม่เกิน 100 ตัวอักษร')

export const createOrganizationSchema = z.object({
  name: orgNameSchema,
  slug: orgSlugSchema,
})

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>

/**
 * Both fields optional, and at least one required: a PATCH that changes
 * nothing is a request that should say so rather than quietly succeeding and
 * writing an audit row describing no change.
 */
export const updateOrganizationSchema = z
  .object({
    name: orgNameSchema.optional(),
    slug: orgSlugSchema.optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.slug !== undefined,
    'ต้องระบุอย่างน้อยหนึ่งอย่างที่จะแก้',
  )

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>

/**
 * Who to change, and to what. The user id is in the path; this is the body.
 *
 * `owner` is a valid value here — appointing one is what an owner is for.
 * Whether *this* caller may set it is a permission question, not a shape
 * question, and answering it in the schema would put the rule in two places.
 */
export const changeMemberRoleSchema = z.object({
  role: z.enum(ORG_ROLES, 'role ต้องเป็น owner, admin หรือ member'),
})

export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>

/** The path parameter, validated rather than trusted into a query. */
export const memberUserIdSchema = idSchema('user id ไม่ถูกต้อง')
