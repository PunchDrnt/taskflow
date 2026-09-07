import { z } from 'zod'

/**
 * The login name, and nothing else's job.
 *
 * Narrow because it ends up in a URL and in an @-mention: spaces, dots and
 * unicode would make every consumer decide how to escape it, and confusable
 * characters are how one person gets mistaken for another. Lower-cased here so
 * what is stored matches what the database CHECK allows — the column is
 * `citext`, so `Anong` would find the same row either way, but it would be
 * *stored* with its capital and then appear two ways across the product.
 *
 * Not `nickname`, which is the opposite in every respect: what colleagues
 * actually call the person, may repeat, and exists to be searched.
 */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z][a-z0-9_]{2,29}$/,
    'ใช้ a-z 0-9 _ ยาว 3-30 ตัว และขึ้นต้นด้วยตัวอักษร',
  )

/**
 * E.164, which is a storage decision rather than an input one: two people who
 * typed `081-234-5678` and `+66 81 234 5678` must end up comparable, since the
 * column is unique among live accounts.
 *
 * Punctuation and spaces are stripped before the pattern is applied, and a
 * leading `0` is read as Thai — this is an internal tool for one Thai company,
 * so guessing +66 is right far more often than making everyone type it.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()\-.]/g, ''))
  .transform((value) =>
    value.startsWith('0') ? `+66${value.slice(1)}` : value,
  )
  .refine((value) => /^\+[1-9][0-9]{7,14}$/.test(value), 'เบอร์โทรไม่ถูกต้อง')

/**
 * A person's own profile. Email is not here on purpose: changing it is an
 * identity change, not a profile edit — it is what signs you in, it has to be
 * unique across the system, and it needs a confirmation round trip to the new
 * address before it takes effect. That flow is Phase 2's.
 *
 * `username` *is* here, and that is a deliberate difference: it is also a way
 * in, but changing it needs no proof that anybody still reads an inbox. The
 * cost is that old @-mentions and links stop resolving, which for a hundred
 * colleagues is a smaller problem than being stuck with a name you mistyped.
 */
export const updateProfileSchema = z.object({
  username: usernameSchema,
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
  /** Null clears it. Optional in the sense that most people will not have one. */
  phone: phoneSchema.nullable(),
  /**
   * Null clears the picture. A URL rather than an upload: the file goes
   * straight to object storage through a presigned PUT, and this records
   * where it landed.
   */
  avatarUrl: z.url('ลิงก์รูปไม่ถูกต้อง').max(2048).nullable(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
