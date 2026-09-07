import type { StatusColor } from '@repo/shared'

/** One of the statuses a new project starts with, before it has a sort key. */
interface DefaultStatus {
  name: string
  color: StatusColor
  /** Where a new task lands. Exactly one of these is true. */
  isDefault?: boolean
  isDoneType?: boolean
  isCancelledType?: boolean
}

/**
 * The four statuses every new project is created with, hardcoded here because
 * there is no org-level template to configure — docs/04-features/phase-1.md
 * settles that, and a template table nobody edits is a table that still has to
 * be migrated.
 *
 * ⚠️ **These are written in the same transaction as the project itself**, not
 * afterwards and not lazily. `task.tasks.status_id` is NOT NULL, so a project
 * with no statuses cannot hold a single task — it is not an empty project, it
 * is a broken one, and the window in which it exists is exactly the gap
 * between two separate writes.
 *
 * **Cancelled is in the starting set on purpose.** It reads like something to
 * add later, and adding it later is the failure: a project with nowhere to put
 * work that was decided against gets that work marked Done instead, and from
 * then on progress and velocity are wrong for every sprint already closed.
 * `is_cancelled_type` leaves the denominator of a progress bar; `is_done_type`
 * stays in it.
 */
export const DEFAULT_STATUSES: readonly DefaultStatus[] = [
  { name: 'To do', color: 'gray', isDefault: true },
  { name: 'In progress', color: 'blue' },
  { name: 'Done', color: 'green', isDoneType: true },
  { name: 'Cancelled', color: 'pink', isCancelledType: true },
]
