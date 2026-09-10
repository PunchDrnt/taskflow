import type { AssignableRow, AssigneeRow, TaskRow } from '@repo/shared'

/**
 * What the project screen's actions answer with.
 *
 * Results rather than throws, and in their own module rather than beside the
 * actions: a `'use server'` file may export nothing but async functions, so a
 * type is fine only because types are erased — a constant would arrive in the
 * browser as `undefined`.
 */
export type QuickAddOutcome =
  { ok: true; task: TaskRow } | { ok: false; message: string }

export type PeopleFound =
  { ok: true; people: AssignableRow[] } | { ok: false; message: string }

/**
 * `needs-project-membership` is separate from `failed` because it is not a
 * failure — it is the API asking a question. Collapsing the two would turn
 * "shall I add them to the project?" into "that did not work".
 */
export type AssignOutcome =
  | { ok: true; assignees: AssigneeRow[] }
  | { ok: false; kind: 'needs-project-membership' | 'failed'; message: string }
