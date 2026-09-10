import type { TaskRow } from '@repo/shared'

import type { TaskLookups } from '../api/tasks'

/**
 * What one press of Load more comes back with.
 *
 * A result rather than a throw. The action runs across the network from the
 * component that called it, and a rejected promise there gives the list
 * nothing to say — the row it already has are still perfectly good, and the
 * only honest response to a failed *next* page is a message beside the button
 * that produced it.
 *
 * Declared here and not beside the action because a `'use server'` module may
 * export nothing but async functions: a type exported from one is erased at
 * compile time, but anything else — a constant, an object — arrives in the
 * browser as `undefined`, which shows up as a property read on nothing at the
 * first use rather than as an error where the mistake is.
 */
export type MoreTasks =
  | {
      ok: true
      rows: TaskRow[]
      nextCursor: string | null
      lookups: TaskLookups
    }
  | { ok: false; message: string }
