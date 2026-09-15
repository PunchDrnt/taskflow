/**
 * Where a file goes in the bucket, and what its path says about it.
 *
 * One bucket, and the prefix is the structure. Not one bucket per
 * organisation: creating a bucket would become a step of creating an
 * organisation that can fail halfway, lifecycle rules would multiply by the
 * customer count, and anything crossing organisations — a retention sweep,
 * a backup audit — would become N calls instead of one listing. A prefix is
 * enough when the API is the only reader and signs every request.
 *
 * 🔒 **The first segment says who the file dies with, and it is the whole
 * point of the layout.**
 *
 * ```
 * org/<orgId>/<type>/<entityId>/<uuid>-<name>   goes when the organisation goes
 * user/<userId>/<type>/<uuid>-<name>            follows the person between orgs
 * ```
 *
 * Avatars used to be filed under the acting organisation — `orgId ?? userId`,
 * so a user id sat in the organisation's own slot, and somebody who belongs to
 * two companies had their picture under whichever one they happened to be
 * looking at when they uploaded it. Nothing was visibly wrong until the first
 * thing that deletes an organisation: sweeping `A/*` would have taken the
 * current avatar of somebody who is still in B. A profile picture belongs to
 * the person, and now the key says so.
 *
 * Keys already in the bucket keep the old shape and keep working. A key is an
 * opaque location the row stores, not something anything parses — `get(key)`
 * fetches whatever is at it — so there is nothing to migrate, only a different
 * shape for what is written next.
 */

/**
 * What kind of thing the file is. A closed set, so a typo is a compile error
 * rather than a second tree nobody notices until they go looking for the
 * first. The names match `discussion.attachments.entity_type`, which Phase 3
 * will write alongside these.
 */
export const STORAGE_ENTITY_TYPES = ['avatar', 'logo', 'attachment'] as const

export type StorageEntityType = (typeof STORAGE_ENTITY_TYPES)[number]

/** Whose file it is, which decides what deleting them takes with it. */
export type StorageOwner =
  { org: string; user?: never } | { user: string; org?: never }

/**
 * Builds the key for one file.
 *
 * `entityId` is for the many-of-a-kind case — one attachment among a comment's
 * several — and is left out where the owner already names the subject, which
 * is why a user's avatar is `user/<id>/avatar/...` rather than repeating the
 * id twice.
 */
export function storageKey({
  owner,
  entityType,
  entityId,
  fileName,
}: {
  owner: StorageOwner
  entityType: StorageEntityType
  entityId?: string
  fileName: string
}): string {
  const root =
    owner.org === undefined ? `user/${owner.user}` : `org/${owner.org}`
  const middle =
    entityId === undefined ? entityType : `${entityType}/${entityId}`

  return `${root}/${middle}/${crypto.randomUUID()}-${safeName(fileName)}`
}

/**
 * Whether a stored value names an object of ours, or a picture somewhere else.
 *
 * `users.avatar_url` holds either: a key this module wrote, or an ordinary
 * http(s) URL for a picture hosted elsewhere. Every caller has to tell them
 * apart — serving one means reading the bucket and the other means redirecting
 * — and the one that matters most is deletion, where mistaking an external URL
 * for a key would send a `DeleteObject` for a path nobody owns.
 *
 * A scheme is the whole test. A key produced by `storageKey` starts `org/` or
 * `user/` and `safeName` cannot introduce a colon, so the two shapes cannot be
 * confused in either direction.
 */
export function isStorageKey(value: string): boolean {
  return !/^https?:\/\//.test(value)
}

/**
 * The prefix holding everything one owner has, for the day something deletes
 * them. The trailing slash is not decoration: without it `org/<id>` also
 * matches `org/<id>-something`, and a listing meant to delete one customer's
 * files is the worst place to find that out.
 */
export function storagePrefix(owner: StorageOwner): string {
  return owner.org === undefined ? `user/${owner.user}/` : `org/${owner.org}/`
}

/** The stored name: readable by a person, and unable to climb out of its prefix. */
function safeName(fileName: string): string {
  // \w is [A-Za-z0-9_], so it replaced every Thai character in the name and
  // "ใบเสร็จ 2026.pdf" arrived as "_2026.pdf". \p{M} is not optional here:
  // Thai vowels and tone marks are combining marks, not letters, so
  // \p{L}\p{N} alone still hollows the word out to "ใบเสร_จ". Path
  // separators are still replaced, so ../ cannot climb out of the prefix.
  return (
    [...fileName.replace(/[^\p{L}\p{N}\p{M}._-]+/gu, '_')]
      // Sliced by code point, not code unit: cutting the tail of a Thai name
      // mid-character would leave a tone mark with nothing to sit on.
      .slice(-120)
      .join('')
  )
}
