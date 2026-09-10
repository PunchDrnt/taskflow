'use client'

import { Button } from '@repo/ui/components/button'
import { Spinner } from '@repo/ui/components/spinner'

/**
 * "Load more" — the whole of this repo's pagination, by choice.
 *
 * 🔒 Paging is a cursor, never an offset (`shared/http/cursor.ts`), and that
 * rules out numbered pages before any design question is asked: a cursor can
 * say "what follows this row" and cannot say "page 7", because `sort_order` is
 * a fractional index that things get inserted into the middle of. Numbered
 * pages over a keyset cursor either repeat rows or skip them.
 *
 * So the control is the one a cursor can honestly back. It appends rather than
 * replaces, which also keeps the client-side grouping above it coherent —
 * a group that emptied itself on every page turn would be worse than no
 * grouping at all.
 *
 * The count is what is loaded, not a total. `Page<T>` carries no total on
 * purpose: `toPage` fetches one probe row to answer `hasMore` instead of
 * running `COUNT(*)` over the same filters a second time.
 */
export function LoadMore({
  loaded,
  hasMore,
  pending,
  onLoadMore,
}: {
  loaded: number
  hasMore: boolean
  pending: boolean
  onLoadMore: () => void
}) {
  return (
    <div className="flex items-center justify-center gap-3 py-4">
      <span
        className="text-text-secondary body-3 tabular-nums"
        aria-live="polite"
      >
        {loaded} loaded
      </span>

      {hasMore && (
        <Button
          variant="outline"
          size="sm"
          color="primary"
          disabled={pending}
          onClick={onLoadMore}
        >
          {pending && <Spinner />}
          {pending ? 'Loading' : 'Load more'}
        </Button>
      )}
    </div>
  )
}
