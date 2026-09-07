import { z } from 'zod'

/**
 * A person's own profile. Email is not here on purpose: changing it is an
 * identity change, not a profile edit — it is what signs you in, it has to be
 * unique across the system, and it needs a confirmation round trip to the new
 * address before it takes effect. That flow is Phase 2's.
 */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'กรุณากรอกชื่อ').max(200, 'ชื่อยาวเกินไป'),
  /**
   * Required, like `name`. Thai users are addressed by their nickname first,
   * so a profile without one is not searchable by what colleagues actually
   * call the person — see docs/04-features/phase-1.md#auth--users.
   */
  nickname: z
    .string()
    .trim()
    .min(1, 'กรุณากรอกชื่อเล่น')
    .max(100, 'ชื่อเล่นยาวเกินไป'),
  /**
   * Null clears the picture. A URL rather than an upload: the file goes
   * straight to object storage through a presigned PUT, and this records
   * where it landed.
   */
  avatarUrl: z.url('ลิงก์รูปไม่ถูกต้อง').max(2048).nullable(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
