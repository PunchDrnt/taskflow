/**
 * Fractional indexing: keys that can always be inserted *between* two others
 * without rewriting any row.
 *
 * Every hand-ordered list in this schema — statuses, sprints, tasks, view
 * columns — stores its position as `sort_order text COLLATE "C"` rather than
 * an integer. Dragging one row then writes one row. With integers it writes
 * every row after the drop point, and two people dragging at once produce two
 * renumberings that interleave into an order neither of them chose.
 *
 * 🔒 **`COLLATE "C"` is load-bearing, not a detail.** A key is compared as
 * bytes, and this module's whole guarantee is that byte order equals the order
 * people see. Under any other collation `C` may sort beside `c`, punctuation
 * may be ignored entirely, and the list silently comes back shuffled. The
 * column is declared with it in `CreateProject`; `test/schema-invariants.spec.ts`
 * holds the two together.
 *
 * ## What a key means
 *
 * A key is the fraction `0.<key>` in base 62, with digits ordered by their
 * ASCII value so that string comparison and numeric comparison agree. There is
 * therefore always room between any two distinct keys: the answer just gets
 * one character longer when the gap is a single digit.
 *
 * The one invariant that keeps string order and numeric order the same is that
 * **a key never ends in the lowest digit** — `'V'` and `'V0'` are the same
 * number, but `'V' < 'V0'` as bytes, and a list holding both has two rows that
 * compare equal to a reader and unequal to Postgres. `between` never produces
 * one, and `isSortOrder` rejects one arriving from anywhere else.
 *
 * The midpoint algorithm is the one the `fractional-indexing` package uses,
 * written out here rather than added as a dependency: it is thirty lines, this
 * repo is meant to stay dependency-light, and the alphabet has to match the
 * column's collation — which is a decision about our schema, not something to
 * inherit from a default.
 */

/**
 * Ascending in ASCII, which is what `COLLATE "C"` compares by. Digits before
 * uppercase before lowercase — the order the bytes are already in, so no
 * lookup table is needed to know that `'9' < 'A' < 'a'`.
 *
 * No punctuation: `-` and `_` sort *below* the digits, so including them would
 * work but leaves keys that are harder to eyeball beside one another in a log.
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

const BASE = DIGITS.length
const LOWEST = DIGITS[0]!

/** Every key is one of these, and nothing else may be written to the column. */
const SORT_ORDER_PATTERN = /^[0-9A-Za-z]+$/

/**
 * Whether a string is a key this module could have produced.
 *
 * Both halves matter. The character class keeps anything outside the alphabet
 * out — a key with a byte below `'0'` would sort before every key in the
 * table, which is how "one row is stuck at the top forever" happens. The
 * trailing-digit rule keeps the numeric and byte orderings in agreement; see
 * the module docblock.
 */
export function isSortOrder(value: string): boolean {
  return (
    SORT_ORDER_PATTERN.test(value) && !value.endsWith(LOWEST) && value !== ''
  )
}

/**
 * A key that sorts strictly between `before` and `after`.
 *
 * `null` means "no bound on that side": `between(null, first)` puts a row at
 * the top of a list, `between(last, null)` at the bottom, and
 * `between(null, null)` is the first key in an empty one.
 *
 * Throws when the bounds are equal or the wrong way round. That is a caller
 * bug — two rows already holding the same key, or a neighbour pair read from a
 * list that was not ordered — and inventing an answer would place the row
 * somewhere neither the caller nor the user asked for.
 */
export function between(before: string | null, after: string | null): string {
  if (before !== null && !isSortOrder(before)) {
    throw new Error(`Not a sort order: ${JSON.stringify(before)}`)
  }
  if (after !== null && !isSortOrder(after)) {
    throw new Error(`Not a sort order: ${JSON.stringify(after)}`)
  }
  if (before !== null && after !== null && before >= after) {
    throw new Error(
      `Cannot insert between ${before} and ${after}: the bounds are equal or ` +
        'reversed. Read the neighbours in sort_order and pass them in that ' +
        'order.',
    )
  }

  return midpoint(before ?? '', after)
}

/**
 * `count` keys in ascending order, for building a list from nothing — the four
 * statuses a new project starts with.
 *
 * Each is appended after the last rather than spread evenly across the range.
 * Evenly spaced keys look tidier and are the wrong shape: real lists grow at
 * the end, and appending is the case that has to stay one row per write.
 */
export function sequence(count: number): string[] {
  const keys: string[] = []
  let last: string | null = null

  for (let index = 0; index < count; index += 1) {
    last = between(last, null)
    keys.push(last)
  }

  return keys
}

/**
 * The midpoint of two keys read as base-62 fractions.
 *
 * Recursive on the shared prefix: `between('a1', 'a3')` is `'a'` followed by
 * the midpoint of `'1'` and `'3'`. When the two differ by a single digit there
 * is no digit in between, so the answer keeps the lower one and grows a
 * character — `between('1', '2')` is `'1V'`, not a failure.
 */
function midpoint(lower: string, upper: string | null): string {
  if (upper !== null) {
    // The shared prefix is common to the answer too, so it is set aside and
    // the problem shrinks. `lower` is padded with the lowest digit rather than
    // `upper` — `upper` cannot run out first, since it is the larger of the
    // two and they agree so far.
    let shared = 0
    while ((lower[shared] ?? LOWEST) === upper[shared]) shared += 1

    if (shared > 0) {
      return (
        upper.slice(0, shared) +
        midpoint(lower.slice(shared), upper.slice(shared))
      )
    }
  }

  // The leading digits differ. An absent `lower` is the lowest digit; an
  // absent `upper` is one past the highest, which is what makes appending
  // land halfway up the remaining range instead of at the very top.
  const low = lower === '' ? 0 : DIGITS.indexOf(lower[0]!)
  const high = upper === null ? BASE : DIGITS.indexOf(upper[0]!)

  if (high - low > 1) {
    return DIGITS[Math.round(0.5 * (low + high))]!
  }

  // Consecutive digits, so the answer has to be longer than one character.
  // When `upper` has a tail of its own, its first digit alone already sits
  // below it and above `lower`.
  if (upper !== null && upper.length > 1) return upper.slice(0, 1)

  // `upper` is a single digit one above `lower`'s, or absent entirely. Keep
  // `lower`'s digit and find room in what follows it: midpoint('49', '5')
  // becomes '4' + midpoint('9', null) = '4' + '9' + midpoint('', null).
  return DIGITS[low]! + midpoint(lower.slice(1), null)
}
