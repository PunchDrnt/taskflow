/** `{ field: { from, to } }` — the shape `audit.logs.changes_json` holds. */
export type Changes = Record<string, { from: unknown; to: unknown }>

/**
 * Columns every table carries, which say nothing a reader of the log wants.
 * `updatedAt` and `updatedBy` in particular change on every single write.
 */
const NOT_WORTH_LOGGING = new Set([
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
])

/**
 * What changed between two versions of a row.
 *
 * Computed once here so every module records the same shape — a log where
 * half the entries are `{ from, to }` and half are `{ old, new }` is one
 * nobody can query.
 */
export function changesBetween(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Changes {
  const changes: Changes = {}

  for (const field of new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ])) {
    if (NOT_WORTH_LOGGING.has(field)) continue

    const from = before[field]
    const to = after[field]
    if (same(from, to)) continue

    changes[field] = { from: normalise(from), to: normalise(to) }
  }

  return changes
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (a === b) return true

  // Dates and jsonb both arrive as objects; comparing them by reference would
  // report a change on every save.
  if (
    a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object'
  )
    return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b))

  return false
}

function normalise(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value
}
