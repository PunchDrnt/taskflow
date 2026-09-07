import { describe, expect, it } from 'vitest'

import { ApiException } from './api-exception'
import { decodeCursor, encodeCursor, toPage } from './cursor'

describe('cursor', () => {
  it('round-trips a pair', () => {
    expect(decodeCursor(encodeCursor(['a0V', 'abc-123']))).toEqual([
      'a0V',
      'abc-123',
    ])
  })

  it('survives values that would break a delimiter-joined encoding', () => {
    const awkward: [string, string] = [
      '2026-09-30T10:00:00.000Z|,:"',
      'id-with-|-and-,',
    ]

    expect(decodeCursor(encodeCursor(awkward))).toEqual(awkward)
  })

  it('is opaque — not the sort value in the clear', () => {
    // A client that reads one has coupled itself to the ordering, and the day
    // a sort gains a tiebreaker their paging breaks invisibly from here.
    expect(encodeCursor(['a0', 'abc'])).not.toContain('a0')
  })

  for (const [label, raw] of [
    ['not base64 at all', 'not-a-real-cursor!!'],
    ['base64 of nothing useful', Buffer.from('hello').toString('base64url')],
    ['a JSON array of the wrong length', encodeJson(['only-one'])],
    ['a JSON array of the wrong types', encodeJson([1, 2])],
    ['a JSON object', encodeJson({ sort: 'a0', id: 'abc' })],
  ] as const) {
    it(`answers 400 for ${label}`, () => {
      // These arrive in URLs people copy, edit and truncate: a bad one is a
      // bad request, never a 500.
      let thrown: unknown

      try {
        decodeCursor(raw)
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(ApiException)
      expect((thrown as ApiException).getStatus()).toBe(400)
    })
  }

  describe('toPage', () => {
    const rows = [1, 2, 3, 4]
    const cursorOf = (row: number): [string, string] => [
      String(row),
      `id-${row}`,
    ]

    it('trims the probe row and reports there is more', () => {
      const page = toPage(rows, 3, cursorOf, (row) => row * 10)

      expect(page.data).toEqual([10, 20, 30])
      expect(page.meta.hasMore).toBe(true)
      // The cursor names the last *visible* row, not the probe.
      expect(decodeCursor(page.meta.nextCursor!)).toEqual(['3', 'id-3'])
    })

    it('ends the walk when the probe row never came back', () => {
      const page = toPage(rows, 4, cursorOf, (row) => row)

      expect(page.data).toEqual([1, 2, 3, 4])
      expect(page.meta).toEqual({ hasMore: false, nextCursor: null })
    })

    it('handles an empty result without inventing a cursor', () => {
      expect(toPage([], 10, cursorOf, (row) => row).meta).toEqual({
        hasMore: false,
        nextCursor: null,
      })
    })
  })
})

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}
