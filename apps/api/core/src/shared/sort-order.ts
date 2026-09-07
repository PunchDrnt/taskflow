import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

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
 * bytes, and the whole guarantee is that byte order equals the order people
 * see. Under any other collation `C` may sort beside `c` and the list comes
 * back shuffled with nothing to indicate why. The column is declared with it
 * in `CreateProject` and `CreateTask`.
 *
 * The library is `fractional-indexing` — Figma's, named by
 * docs/01-architecture.md#lexorank--sort_order, which also says not to write
 * one by hand. Its default alphabet is `0-9A-Za-z`, already in ascending ASCII
 * order, so string comparison and the column's collation agree with no
 * configuration; the demo seed's `a0` and `a1` are keys in exactly this
 * format. This module exists so the coupling above is written down once, at
 * the point every caller reaches for, rather than rediscovered per table.
 *
 * Not covered here, and noted in the doc: keys grow a character each time
 * something is dropped into the same gap, so a list dragged over for years
 * eventually wants a rebalance pass. Nothing needs one yet.
 */

/**
 * A key that sorts strictly between `before` and `after`.
 *
 * `null` means no bound on that side: `between(null, first)` puts a row at the
 * top of a list, `between(last, null)` at the bottom, and `between(null, null)`
 * is the first key in an empty one.
 *
 * ⚠️ **Reversed bounds are refused here, not by the library.** `generateKeyBetween`
 * only rejects the pair when it cannot do the arithmetic: `('a1', 'a0')` comes
 * back as `'a0V'`, a perfectly valid key that sorts *below both* of the rows it
 * was meant to go between — so the row lands somewhere nobody asked for and
 * nothing reports a problem. Measured against fractional-indexing 4.0.0. A
 * caller reaches this by reading neighbours out of a list that was not ordered
 * by `sort_order`, which is a bug worth an exception rather than a silent
 * misfile.
 */
export function between(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) {
    throw new Error(
      `Cannot insert between ${before} and ${after}: the bounds are equal or ` +
        'reversed. Read the neighbours ordered by sort_order and pass them in ' +
        'that order.',
    )
  }

  return generateKeyBetween(before, after)
}

/**
 * `count` keys in ascending order, for building a list from nothing — the four
 * statuses a new project starts with.
 */
export function sequence(count: number): string[] {
  return generateNKeysBetween(null, null, count)
}
