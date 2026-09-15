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
    'Use a-z, 0-9 and _, 3-30 characters, starting with a letter',
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
  .refine(
    (value) => /^\+[1-9][0-9]{7,14}$/.test(value),
    'Enter a valid phone number',
  )

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
  .min(1, 'Enter your name')
  .max(200, 'Name is too long')

/**
 * Required, like `name`. Thai users are addressed by their nickname first, so
 * a profile without one is not searchable by what colleagues actually call
 * the person — see docs/04-features/phase-1.md#auth--users.
 */
export const nicknameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a nickname')
  .max(100, 'Nickname is too long')

export const updateProfileSchema = z.object({
  username: usernameSchema,
  name: personNameSchema,
  nickname: nicknameSchema,
  /** Null clears it. Optional in the sense that most people will not have one. */
  phone: phoneSchema.nullable(),
  /**
   * Where the picture is. Null clears it.
   *
   * Either the **storage key** `POST /v1/me/avatar` handed back, or an
   * ordinary http(s) URL for a picture hosted somewhere else. Both, because
   * the bucket is private: a key cannot be rendered directly, so
   * `GET /v1/users/:id/avatar` reads the object and serves it, while an
   * external URL is already a picture and needs no help.
   */
  avatarUrl: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .refine(
      (value) => !value.includes('..') && !value.startsWith('/'),
      'Invalid image location',
    )
    .nullable(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

/**
 * What `POST /v1/me/avatar` accepts.
 *
 * The file goes **through the API**, which is what makes these two constants
 * mean anything: a limit the server enforces is a limit, and a limit the
 * browser applies to itself is a suggestion to whoever is not using a browser.
 * The route rejects on both counts before a byte reaches storage.
 *
 * Here rather than in the API so the upload control can state the same numbers
 * it will be judged by, instead of a second copy that drifts.
 */
export const AVATAR_MIME_TYPES = [
  'image/webp',
  'image/png',
  'image/jpeg',
] as const

export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number]

/**
 * Comfortably above what the browser's own resize produces — a 512px WebP is
 * 30-60KB — and far below anything worth calling an upload. The headroom is
 * for the PNG a browser falls back to when it cannot encode WebP.
 *
 * Enforced by the route's own `limits.fileSize`, which aborts mid-stream: a
 * refused upload costs the bytes read before the limit was passed, not a whole
 * file that is then measured and thrown away.
 */
export const AVATAR_MAX_BYTES = 1024 * 1024

/**
 * The longest side that survives, and the WebP quality it survives at.
 *
 * **Both sides use these, and that is the point.** The browser resizes before
 * uploading so the wire carries 40KB instead of 4MB; the API resizes again
 * because what arrives is whatever the caller chose to send, and a limit only
 * one end applies is not a limit. Same numbers, so the second pass is a
 * no-op on anything the first pass produced.
 *
 * Avatars are drawn at 24-40px. The extra resolution is for high-density
 * screens and nothing else. Below ~0.8 quality the artefacts show on faces.
 */
export const AVATAR_MAX_EDGE = 512
export const AVATAR_QUALITY = 0.85

/** Only for the object key, so a stored file is recognisable in the bucket. */
export const avatarFileNameSchema = z
  .string()
  .trim()
  .min(1, 'Provide a file name')
  .max(255)
