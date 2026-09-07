import { describe, expect, it } from 'vitest'

import { between, sequence } from './sort-order'

/**
 * The library does the arithmetic; what is worth pinning is the property this
 * schema depends on — sorting the keys as *bytes* gives back the order they
 * were inserted in. Postgres compares `sort_order` exactly that way
 * (`text COLLATE "C"`), so a case that holds here holds in the database.
 *
 * These would also catch a swap to an alphabet whose order is not ASCII, which
 * is the one change that would break the collation coupling silently.
 */
const byBytes = (keys: string[]): string[] =>
  [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

describe('sort order', () => {
  describe('between', () => {
    it('puts a key between two neighbours', () => {
      const key = between('a0', 'a1')

      expect(key > 'a0').toBe(true)
      expect(key < 'a1').toBe(true)
    })

    it('keeps finding room however many times it is asked', () => {
      // Dropping a row into the same gap over and over is what fine-grained
      // reordering actually looks like. Each key must land strictly inside the
      // last pair, forever — no floor, no collision, no renumbering.
      let low = 'a0'
      const high = 'a1'

      for (let i = 0; i < 50; i += 1) {
        const key = between(low, high)

        expect(key > low).toBe(true)
        expect(key < high).toBe(true)
        low = key
      }
    })

    it('puts a key at either end of a list', () => {
      expect(between(null, 'a1') < 'a1').toBe(true)
      expect(between('a1', null) > 'a1').toBe(true)
    })

    it('answers for an empty list', () => {
      expect(between(null, null)).toBe('a0')
    })

    it('stays inside the ASCII-ordered alphabet', () => {
      // The collation coupling, stated as an assertion. A character below '0'
      // or above 'z' would sort outside every other key and pin its row to one
      // end of the list permanently.
      const keys = [
        between(null, null),
        between(null, 'a1'),
        between('a0', 'a1'),
        ...sequence(20),
      ]

      for (const key of keys) expect(key).toMatch(/^[0-9A-Za-z]+$/)
    })

    it('refuses bounds that are reversed or equal', () => {
      // ⚠️ The library does not. `generateKeyBetween('a1', 'a0')` returns
      // 'a0V' — a valid key that sorts below *both* bounds, so the row is
      // filed somewhere nobody asked for and nothing complains. That is what
      // the wrapper is for; this is the case that would come back silently.
      expect(() => between('a1', 'a0')).toThrow(/equal or reversed/)
      expect(() => between('a0', 'a0')).toThrow(/equal or reversed/)
    })
  })

  describe('sequence', () => {
    it('builds an ascending list', () => {
      expect(sequence(4)).toEqual(['a0', 'a1', 'a2', 'a3'])
    })

    it('is empty for a count of zero', () => {
      expect(sequence(0)).toEqual([])
    })
  })

  describe('the ordering property', () => {
    it('survives an arbitrary sequence of inserts', () => {
      // Builds a list by repeatedly dropping a key into a random gap, then
      // checks the whole thing sorts as bytes into the order it was assembled
      // in. This is the claim the schema rests on, stated once.
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
})
