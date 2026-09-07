import { describe, expect, it } from 'vitest'

import { between, isSortOrder, sequence } from './sort-order'

/**
 * The property everything else rests on: for any list of keys, sorting them as
 * bytes gives back the order they were inserted in. Postgres compares the
 * column exactly this way — `text COLLATE "C"` — so a case that holds here
 * holds in the database.
 */
const byBytes = (keys: string[]): string[] =>
  [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

describe('sort order', () => {
  describe('between', () => {
    it('puts a key between two neighbours', () => {
      const key = between('a', 'c')

      expect(key > 'a').toBe(true)
      expect(key < 'c').toBe(true)
    })

    it('finds room between consecutive digits by growing', () => {
      // The case an integer column cannot answer at all, and the reason this
      // module exists: there is no digit between '1' and '2', so the key gets
      // longer instead of the list getting renumbered.
      const key = between('1', '2')

      expect(key > '1').toBe(true)
      expect(key < '2').toBe(true)
      expect(key.length).toBeGreaterThan(1)
    })

    it('keeps finding room however many times it is asked', () => {
      // Dropping a row into the same gap over and over is what a person doing
      // fine-grained reordering actually does. Each key must land strictly
      // inside the last pair, forever — no floor, no collision.
      let low = '1'
      const high = '2'

      for (let i = 0; i < 50; i += 1) {
        const key = between(low, high)

        expect(key > low).toBe(true)
        expect(key < high).toBe(true)
        low = key
      }
    })

    it('puts a key at the top of a list', () => {
      const key = between(null, 'V')

      expect(key < 'V').toBe(true)
      expect(isSortOrder(key)).toBe(true)
    })

    it('puts a key at the bottom of a list', () => {
      const key = between('V', null)

      expect(key > 'V').toBe(true)
      expect(isSortOrder(key)).toBe(true)
    })

    it('answers for an empty list', () => {
      expect(isSortOrder(between(null, null))).toBe(true)
    })

    it('never produces a key ending in the lowest digit', () => {
      // The invariant that keeps byte order and numeric order agreeing: 'V'
      // and 'V0' are the same fraction but compare unequal as bytes, so a
      // table holding both has two rows a reader cannot tell apart and
      // Postgres can.
      const keys = [
        between(null, null),
        between(null, '1'),
        between('1', '2'),
        between('0001', '001'),
        ...sequence(20),
      ]

      for (const key of keys) expect(key.endsWith('0')).toBe(false)
    })

    it('refuses bounds that are reversed or equal', () => {
      // A caller bug — neighbours read from an unordered list, or two rows
      // already sharing a key. Inventing an answer would file the row
      // somewhere nobody asked for.
      expect(() => between('c', 'a')).toThrow(/equal or reversed/)
      expect(() => between('a', 'a')).toThrow(/equal or reversed/)
    })

    it('refuses a bound that is not a key', () => {
      // Anything below '0' in ASCII sorts above every real key's neighbours
      // and pins a row to one end of the list permanently.
      expect(() => between('a-b', null)).toThrow(/Not a sort order/)
      expect(() => between(null, '')).toThrow(/Not a sort order/)
      // Valid characters, invalid shape.
      expect(() => between('a0', null)).toThrow(/Not a sort order/)
    })
  })

  describe('sequence', () => {
    it('builds an ascending list', () => {
      const keys = sequence(4)

      expect(keys).toHaveLength(4)
      expect(byBytes(keys)).toEqual(keys)
    })

    it('is empty for a count of zero', () => {
      expect(sequence(0)).toEqual([])
    })
  })

  describe('the ordering property', () => {
    it('survives an arbitrary sequence of inserts', () => {
      // Builds a list by repeatedly dropping a key into a random gap, then
      // checks the whole thing sorts as bytes into the order it was assembled
      // in. This is the claim the schema depends on, stated once.
      let keys = sequence(3)

      for (let step = 0; step < 200; step += 1) {
        const at = Math.floor(Math.random() * (keys.length + 1))
        const key = between(keys[at - 1] ?? null, keys[at] ?? null)

        keys = [...keys.slice(0, at), key, ...keys.slice(at)]
      }

      expect(byBytes(keys)).toEqual(keys)
      expect(new Set(keys).size).toBe(keys.length)
    })
  })

  describe('isSortOrder', () => {
    it('accepts what between produces and rejects the rest', () => {
      expect(isSortOrder('V')).toBe(true)
      expect(isSortOrder('a1')).toBe(true)

      expect(isSortOrder('')).toBe(false)
      // Trailing lowest digit: numerically equal to 'a', unequal as bytes.
      expect(isSortOrder('a0')).toBe(false)
      expect(isSortOrder('a-b')).toBe(false)
      expect(isSortOrder('a b')).toBe(false)
      expect(isSortOrder('ก')).toBe(false)
    })
  })
})
