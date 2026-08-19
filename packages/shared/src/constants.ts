/**
 * Values that are fixed by the spec in `.claude/docs` and consumed by both
 * the API and the web client. Domain zod schemas land here in Phase 0, once
 * the entities they describe actually exist.
 */

/**
 * Deepest `tasks.depth` allowed. 1 means two levels (task + sub-task).
 * Phase 5 may raise this to 2; nothing should hard-code the limit.
 */
export const MAX_TASK_DEPTH = 1

/** Status colours are stored as tokens, never as hex. */
export const STATUS_COLORS = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
] as const

export type StatusColor = (typeof STATUS_COLORS)[number]
