import type { MyWorkRow } from '@repo/shared'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@repo/ui/components/empty'

import { dueBucket } from '../../lib/format/due-date'
import { WorkRow } from '../molecules/work-row'

/**
 * What is due, in the order a morning is planned.
 *
 * Three piles rather than one list: "late", "this week" and "everything else"
 * are the questions actually being asked, and a single date-ordered list makes
 * the first two indistinguishable from the third until you read every line.
 *
 * Undated work falls in with "later" instead of being hidden — the API sorts
 * it last through `COALESCE(due_date, 'infinity')`, and dropping it from Home
 * would mean a task with no deadline is a task nobody ever sees again.
 */
export function DueWork({ rows }: { rows: MyWorkRow[] }) {
  const now = new Date()
  const overdue = rows.filter(
    (row) => dueBucket(row.dueDate, now) === 'overdue',
  )
  const soon = rows.filter((row) =>
    ['today', 'soon'].includes(dueBucket(row.dueDate, now)),
  )
  const later = rows.filter((row) =>
    ['later', 'none'].includes(dueBucket(row.dueDate, now)),
  )

  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Nothing assigned to you</EmptyTitle>
          <EmptyDescription>
            Work given to you shows up here, soonest deadline first.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Pile title="Overdue" rows={overdue} overdue />
      <Pile title="Next seven days" rows={soon} />
      <Pile title="Later" rows={later} />
    </div>
  )
}

function Pile({
  title,
  rows,
  overdue = false,
}: {
  title: string
  rows: MyWorkRow[]
  overdue?: boolean
}) {
  if (rows.length === 0) return null

  return (
    <section>
      <h2 className="text-text-secondary mb-2 text-xs font-medium tracking-wide uppercase">
        {title} <span className="tabular-nums">({rows.length})</span>
      </h2>
      <ul className="bg-default border-default rounded-lg border px-2">
        {rows.map((task) => (
          <WorkRow key={task.id} task={task} overdue={overdue} />
        ))}
      </ul>
    </section>
  )
}
