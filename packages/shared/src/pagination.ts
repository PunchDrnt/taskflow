/**
 * The envelope every list response uses, as fixed by
 * docs/01-architecture.md#api. Here rather than in the API because the client
 * reads `meta.nextCursor` to ask for the next page, and a shape defined on one
 * side only is one the other has to guess at.
 *
 * A single resource is returned bare; a list is wrapped. Uniform even for
 * lists that never paginate — a client that has to remember which endpoints
 * are wrapped is a client that gets it wrong on the one that changes later.
 */
export interface Page<T> {
  data: T[]
  meta: {
    /** Feed back as `?cursor=` for the next page. Null means this is the end. */
    nextCursor: string | null
    hasMore: boolean
  }
}

/** The whole list at once, for a set small enough that paging it is noise. */
export function wholeList<T>(data: T[]): Page<T> {
  return { data, meta: { nextCursor: null, hasMore: false } }
}

/** How many rows a list returns when the caller does not say. */
export const DEFAULT_PAGE_SIZE = 50

/** The ceiling, so one request cannot ask for a project's entire history. */
export const MAX_PAGE_SIZE = 100
