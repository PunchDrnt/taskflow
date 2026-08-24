/**
 * The body every failed request carries — RFC 7807, abbreviated, as fixed by
 * docs/01-architecture.md#api. Here rather than in the API because the web
 * client branches on `code`, and a shape defined on one side only is one the
 * other has to guess at.
 */
export interface ApiErrorBody {
  /** Repeats the HTTP status, so a caller holding only the body still knows. */
  statusCode: number
  /**
   * The stable, machine-readable half. `SCREAMING_SNAKE_CASE`, and never
   * rephrased once shipped: the client branches on it, so editing one is a
   * breaking change in a way that editing `message` is not.
   */
  code: string
  /** Thai, and displayable as-is. Never a stack trace or an SQL fragment. */
  message: string
  /** Whatever the client needs to say more than `message` does. */
  details?: unknown
}

/**
 * The codes that are not specific to any one feature. Domain codes
 * (`STATUS_IN_USE` and its kind) live with the module that raises them —
 * collecting every code in one file would make this a place every module has
 * to edit.
 */
export const API_ERROR_CODES = {
  /** Request body, query or params did not match the schema. */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  /** Not signed in, or the session is no longer good. */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** Signed in, but not allowed to do this. */
  FORBIDDEN: 'FORBIDDEN',
  /** No such row — including one that belongs to another org. */
  NOT_FOUND: 'NOT_FOUND',
  /** Nothing more specific, and nothing the client can act on. */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES]

/** One failed field, as `VALIDATION_FAILED` reports it. */
export interface ValidationIssue {
  /** Dotted path: `email`, `items.0.title`. Empty string for the root. */
  path: string
  message: string
}
