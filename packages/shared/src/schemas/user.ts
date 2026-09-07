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
export const personNameSchema = z
  .string()
  .trim()
  .min(1, 'กรุณากรอกชื่อ')
  .max(200, 'ชื่อยาวเกินไป')

/**
 * Required, like `name`. Thai users are addressed by their nickname first, so
 * a profile without one is not searchable by what colleagues actually call
 * the person — see docs/04-features/phase-1.md#auth--users.
 */
export const nicknameSchema = z
  .string()
  .trim()
  .min(1, 'กรุณากรอกชื่อเล่น')
  .max(100, 'ชื่อเล่นยาวเกินไป')

export const updateProfileSchema = z.object({
  username: usernameSchema,
  name: personNameSchema,
  nickname: nicknameSchema,
  /** Null clears it. Optional in the sense that most people will not have one. */
  phone: phoneSchema.nullable(),
  /**
   * Where the picture is. Null clears it.
   *
   * Either the **storage key** the upload endpoint handed back, or an ordinary
   * http(s) URL for a picture hosted somewhere else. Both, because the bucket
   * is private: a key cannot be rendered directly, so `GET /v1/users/:id/avatar`
   * presigns and redirects, while an external URL is already a picture and
   * needs no help.
   *
   * The file itself never passes through the API — see `avatarUploadSchema`.
   */
  avatarUrl: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .refine(
      (value) => !value.includes('..') && !value.startsWith('/'),
      'ที่อยู่รูปไม่ถูกต้อง',
    )
    .nullable(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

/**
 * Asking for somewhere to put a new avatar.
 *
 * The browser PUTs the file straight to object storage and then sends the
 * resulting URL back through `PATCH /v1/me`. Two round trips rather than one
 * multipart upload through the API, and worth it: the file never occupies a
 * Node process, an upload that is abandoned halfway leaves nothing behind but
 * an unreferenced object, and the API never becomes a proxy whose memory
 * limits are the real file size limit.
 */
export const avatarUploadSchema = z.object({
  /** Only for the object key, so a stored file is recognisable in the bucket. */
  fileName: z.string().trim().min(1, 'กรุณาระบุชื่อไฟล์').max(255),
})

export type AvatarUploadInput = z.infer<typeof avatarUploadSchema>
