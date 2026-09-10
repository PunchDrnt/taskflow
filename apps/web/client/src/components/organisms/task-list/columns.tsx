import Link from 'next/link'

import type { TaskRow } from '@repo/shared'

import type { TaskLookups } from '../../../lib/api/tasks'
import { formatDueDate } from '../../../lib/format/due-date'
import { PriorityTag } from '../../atoms/priority-tag'
import { ProjectDot } from '../../atoms/project-dot'
import { StatusBadge } from '../../atoms/status-badge'
import { TaskKey } from '../../atoms/task-key'
import { AssigneeStack } from '../../molecules/assignee-stack'

/**
 * Every column a task list can draw, declared once.
 *
 * 🔒 **No `<th>` is written in JSX anywhere.** The table renders whatever
 * array of ids it is handed, so Phase 4's saved views — where `view.columns`
 * arrives from a row in the database — change what is on screen by changing
 * the array and nothing else. A hard-coded header is not merely untidy: it is
 * a header with no cell to match it, and the two drift the moment somebody
 * reorders one of them.
 *
 * The ids are what crosses a boundary, never these objects. A column holds a
 * `cell` function, which no serialiser can send to a client component or store
 * in a database; a list of strings survives both, and the registry resolves
 * them on the side that draws.
 */
export type TaskColumnId =
  'key' | 'title' | 'project' | 'status' | 'priority' | 'assignees' | 'dueDate'

export interface TaskColumn {
  id: TaskColumnId
  header: string
  /**
   * Put on the `<th>` **and** every `<td>` in the column, which is what keeps
   * a responsive column from becoming a header with no cells under it.
   */
  className?: string
  cell: (task: TaskRow, lookups: TaskLookups) => React.ReactNode
}

export const TASK_COLUMNS: Record<TaskColumnId, TaskColumn> = {
  key: {
    id: 'key',
    header: 'Key',
    className: 'w-24',
    cell: (task) => <TaskKey>{task.key}</TaskKey>,
  },

  title: {
    id: 'title',
    header: 'Title',
    // The one column allowed to take the leftover width, and the one allowed
    // to wrap out of `whitespace-nowrap` — a truncated title is a task nobody
    // can identify, which is the opposite of what a list is for.
    className: 'w-full max-w-0',
    cell: (task) => (
      <Link
        href={`/tasks/${task.id}`}
        className="text-text-primary body-2 hover:text-primary-light block truncate"
      >
        {task.title}
      </Link>
    ),
  },

  project: {
    id: 'project',
    header: 'Project',
    className: 'hidden lg:table-cell',
    cell: (task, lookups) => {
      const project = lookups.projects[task.projectId]

      // Not an error. Somebody removed from a project between two pages has
      // rows whose project is no longer in their list, and a dash is a truer
      // answer than a name fetched from somewhere they can no longer see.
      if (project === undefined) {
        return <span className="text-text-disabled body-3">—</span>
      }

      return (
        <span className="text-text-secondary body-3 flex items-center gap-1.5">
          <ProjectDot color={project.color} />
          {project.name}
        </span>
      )
    },
  },

  status: {
    id: 'status',
    header: 'Status',
    cell: (task, lookups) => {
      const status = lookups.statuses[task.statusId]

      if (status === undefined) {
        return <span className="text-text-disabled body-3">—</span>
      }

      return <StatusBadge status={status} />
    },
  },

  priority: {
    id: 'priority',
    header: 'Priority',
    className: 'hidden md:table-cell',
    cell: (task) =>
      task.priority === null ? (
        <span className="text-text-disabled body-3">—</span>
      ) : (
        <PriorityTag priority={task.priority} />
      ),
  },

  assignees: {
    id: 'assignees',
    header: 'Assignees',
    className: 'hidden sm:table-cell',
    cell: (task) => <AssigneeStack assignees={task.assignees} />,
  },

  dueDate: {
    id: 'dueDate',
    header: 'Due',
    className: 'text-right',
    cell: (task) =>
      task.dueDate === null ? (
        <span className="text-text-disabled body-3">—</span>
      ) : (
        <span className="text-text-secondary body-3 tabular-nums">
          {formatDueDate(task.dueDate)}
        </span>
      ),
  },
}

/**
 * What My Tasks shows until somebody can choose.
 *
 * Hard-coded, which the checklist allows for Phase 1 and the registry above
 * makes a one-line change later. `project` earns its place even though the key
 * already carries a prefix: prefixes are unique per project but may repeat
 * inside one organisation, so `OPS-12` alone does not always say which board
 * it came from.
 */
export const DEFAULT_TASK_COLUMNS: TaskColumnId[] = [
  'key',
  'title',
  'project',
  'status',
  'priority',
  'assignees',
  'dueDate',
]
