import { describe, expect, it } from 'vitest'

import { ApiException } from './api-exception'
import { decodeCursor, encodeCursor, toPage } from './cursor'

describe('cursor', () => {
  it('round-trips one ordering value and the id', () => {
    expect(
      decodeCursor(encodeCursor({ values: ['a0V'], id: 'abc-123' }), 1),
    ).toEqual({ values: ['a0V'], id: 'abc-123' })
  })

  it('round-trips a rule per ordering value, in order', () => {
    const held = { values: ['4', '2026-09-30T10:00:00.000Z'], id: 'abc' }

    expect(decodeCursor(encodeCursor(held), 2)).toEqual(held)
  })

  it('survives values that would break a delimiter-joined encoding', () => {
    const awkward = {
      values: ['2026-09-30T10:00:00.000Z|,:"'],
      id: 'id-with-|-and-,',
    }

    expect(decodeCursor(encodeCursor(awkward), 1)).toEqual(awkward)
  })

  it('is opaque — not the sort value in the clear', () => {
    // A client that reads one has coupled itself to the ordering, and the day
    // a sort gains a rule their paging breaks invisibly from here.
    expect(encodeCursor({ values: ['a0'], id: 'abc' })).not.toContain('a0')
  })

  it('refuses a cursor from a differently sorted list', () => {
    // Not a pedantic length check: the values in it were read off another
    // ordering, so resuming from them would compare a due date against a
    // priority rank and page from somewhere nobody asked for. The client's
    // answer is the first page, which is what changing a sort means anyway.
    const fromOneRule = encodeCursor({ values: ['a0'], id: 'abc' })

    expect(() => decodeCursor(fromOneRule, 2)).toThrow(ApiException)
  })

  for (const [label, raw, rules] of [
    ['not base64 at all', 'not-a-real-cursor!!', 1],
    ['base64 of nothing useful', Buffer.from('hello').toString('base64url'), 1],
    ['a JSON array of the wrong length', encodeJson(['only-one']), 1],
    ['a JSON array of the wrong types', encodeJson([1, 2]), 1],
    ['a JSON object', encodeJson({ sort: 'a0', id: 'abc' }), 1],
  ] as const) {
    it(`answers 400 for ${label}`, () => {
      // These arrive in URLs people copy, edit and truncate: a bad one is a
      // bad request, never a 500.
      let thrown: unknown

      try {
        decodeCursor(raw, rules)
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(ApiException)
      expect((thrown as ApiException).getStatus()).toBe(400)
    })
  }

  describe('toPage', () => {
    const rows = [1, 2, 3, 4]
    const cursorOf = (row: number) => ({
      values: [String(row)],
      id: `id-${row}`,
    })

    it('trims the probe row and reports there is more', () => {
      const page = toPage(rows, 3, cursorOf, (row) => row * 10)

      expect(page.data).toEqual([10, 20, 30])
      expect(page.meta.hasMore).toBe(true)
      // The cursor names the last *visible* row, not the probe.
      expect(decodeCursor(page.meta.nextCursor!, 1)).toEqual({
        values: ['3'],
        id: 'id-3',
      })
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
