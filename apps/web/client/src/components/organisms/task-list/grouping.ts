import { TASK_PRIORITIES, type TaskPriority, type TaskRow } from '@repo/shared'

import type { TaskLookups } from '../../../lib/api/tasks'
import { dueBucket, type DueBucket } from '../../../lib/format/due-date'
import type { TaskGrouping } from '../../../lib/tasks/query'

export interface TaskGroup {
  key: string
  /** Empty when nothing is being grouped, which is what suppresses the heading. */
  label: string
  /**
   * The colour of the heading's dot, or null when this grouping has none.
   *
   * Only the groupings whose colour somebody actually chose carry one —
   * statuses and projects have a colour in the database, and priority has one
   * the theme already assigns in `PriorityTag`. Due-date buckets have none,
   * and painting them would give this heading a colour vocabulary no other
   * screen uses; the words "Overdue" and "Later" carry themselves.
   */
  dot: string | null
  rows: TaskRow[]
}

/**
 * The loaded rows, piled up by one field.
 *
 * ⚠️ **This groups what is in hand, not what exists.** The API returns one
 * ordered page and this rearranges it, so a group's size grows every time Load
 * more runs. That is the cost of grouping on the client, which the spec picks
 * deliberately: the alternative is an endpoint per grouping — or a `GROUP BY`
 * that cannot be paged with a keyset cursor at all, since the cursor orders
 * rows and a grouped result orders buckets.
 *
 * Group *order* is fixed by meaning rather than by how many rows landed in
 * each: urgent above low, overdue above later, board order for statuses. A
 * pile sorted by size reads differently every time the page loads.
 */
export function groupTasks(
  rows: TaskRow[],
  grouping: TaskGrouping,
  lookups: TaskLookups,
): TaskGroup[] {
  if (grouping === 'none') return [{ key: 'all', label: '', dot: null, rows }]

  const groups = new Map<string, TaskGroup & { rank: string }>()

  for (const task of rows) {
    const bucket = bucketFor(task, grouping, lookups)
    const existing = groups.get(bucket.key)

    if (existing === undefined)
      groups.set(bucket.key, { ...bucket, rows: [task] })
    else existing.rows.push(task)
  }

  return [...groups.values()]
    .sort((left, right) => left.rank.localeCompare(right.rank))
    .map(({ key, label, dot, rows: grouped }) => ({
      key,
      label,
      dot,
      rows: grouped,
    }))
}

/**
 * Which pile a task belongs in, and where that pile sits.
 *
 * `rank` is a string rather than a number so one comparison orders every
 * grouping — statuses rank by `sort_order`, which is a `text COLLATE "C"`
 * fractional index and has no numeric form. The numeric groupings are padded
 * so `10` does not sort before `2`; today there are four priorities and five
 * due buckets, and the padding is what stops that being a fact to remember.
 */
function bucketFor(
  task: TaskRow,
  grouping: Exclude<TaskGrouping, 'none'>,
  lookups: TaskLookups,
): Omit<TaskGroup, 'rows'> & { rank: string } {
  switch (grouping) {
    case 'status': {
      const status = lookups.statuses[task.statusId]

      return status === undefined
        ? { key: 'no-status', label: 'Unknown status', dot: MUTED, rank: '~' }
        : {
            key: status.id,
            label: status.name,
            dot: `var(--color-status-${status.color}-main)`,
            rank: status.sortOrder,
          }
    }

    case 'priority': {
      if (task.priority === null) {
        return {
          key: 'no-priority',
          label: 'No priority',
          dot: MUTED,
          rank: '~',
        }
      }

      // Reversed: the array runs low → urgent, and urgent belongs at the top.
      const rank =
        TASK_PRIORITIES.length - TASK_PRIORITIES.indexOf(task.priority)

      return {
        key: task.priority,
        label: PRIORITY_LABELS[task.priority],
        dot: PRIORITY_DOTS[task.priority],
        rank: String(rank).padStart(2, '0'),
      }
    }

    case 'project': {
      const project = lookups.projects[task.projectId]

      return project === undefined
        ? { key: 'no-project', label: 'Unknown project', dot: MUTED, rank: '~' }
        : // Alphabetical, so the ordering does not shift as work moves about.
          {
            key: project.id,
            label: project.name,
            dot: `var(--color-status-${project.color}-main)`,
            rank: project.name.toLowerCase(),
          }
    }

    case 'due': {
      const bucket = dueBucket(task.dueDate)

      return {
        key: bucket,
        label: DUE_LABELS[bucket],
        dot: null,
        rank: String(DUE_ORDER.indexOf(bucket)).padStart(2, '0'),
      }
    }
  }
}

/** The bucket nobody chose: no status, no project, no priority. */
const MUTED = 'var(--color-text-disabled)'

/**
 * The same four tones `PriorityTag` paints the word in, as a dot.
 *
 * Read from the semantic tokens rather than the eight-colour palette for the
 * reason that component gives: urgency is something the theme already has an
 * opinion about, and a heading that disagreed with the cells under it would be
 * two colours for one fact.
 */
const PRIORITY_DOTS: Record<TaskPriority, string> = {
  urgent: 'var(--color-error-main)',
  high: 'var(--color-warning-main)',
  medium: 'var(--color-text-secondary)',
  low: MUTED,
}

const PRIORITY_LABELS = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
} as const

/** Late first, undated last — the order a morning is planned in. */
const DUE_ORDER: DueBucket[] = ['overdue', 'today', 'soon', 'later', 'none']

const DUE_LABELS: Record<DueBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  soon: 'Next seven days',
  later: 'Later',
  none: 'No due date',
}
