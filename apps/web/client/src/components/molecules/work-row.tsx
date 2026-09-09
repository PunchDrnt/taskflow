import Link from 'next/link'

import type { MyWorkRow } from '@repo/shared'

import { formatDueDate } from '../../lib/format/due-date'
import { OrgDot } from '../atoms/org-dot'
import { TaskKey } from '../atoms/task-key'

/**
 * One task on Home.
 *
 * It names its organisation, which no other list has to: every other screen
 * sits inside one company, and this is the single place where two of them are
 * on screen together — so leaving it off would put a stranger's deadline next
 * to your own with nothing to tell them apart.
 */
export function WorkRow({
  task,
  overdue,
}: {
  task: MyWorkRow
  overdue: boolean
}) {
  return (
    <li>
      <Link
        href={`/tasks/${task.id}`}
        className="hover:bg-subtle border-default flex items-baseline gap-3 rounded-md border-b px-2 py-2.5 last:border-b-0"
      >
        <TaskKey>{task.key}</TaskKey>

        <span className="text-text-primary min-w-0 flex-1 truncate text-sm">
          {task.title}
        </span>

        <span className="text-text-secondary hidden items-center gap-1.5 text-xs sm:flex">
          <OrgDot color={task.projectColor} />
          {task.orgName} · {task.projectName}
        </span>

        {task.dueDate !== null && (
          <span
            className={`shrink-0 text-xs tabular-nums ${
              overdue ? 'text-error-main font-medium' : 'text-text-secondary'
            }`}
          >
            {formatDueDate(task.dueDate)}
          </span>
        )}
      </Link>
    </li>
  )
}
