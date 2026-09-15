import type { TaskRow, TaskSortField } from '@repo/shared'

import { PriorityTag } from '@/components/atoms/priority-tag'
import { ProjectDot } from '@/components/atoms/project-dot'
import { StatusBadge } from '@/components/atoms/status-badge'
import { TaskKey } from '@/components/atoms/task-key'
import { AssigneeStack } from '@/components/molecules/assignee-stack'
import { StatusPicker } from '@/components/molecules/status-picker'
import { AssigneePicker } from '@/components/organisms/assignee-picker'
import type { TaskLookups } from '@/lib/api/tasks'
import { formatDueDate } from '@/lib/format/due-date'
import type { TaskScope } from '@/lib/tasks/query'

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

/**
 * What a cell knows besides the row it is drawing.
 *
 * The assignee column is why this exists: it is read-only on My Tasks, which
 * spans projects and has no single project to add anybody to, and editable on
 * a project screen, which does. Passing the scope keeps that one registry
 * rather than forking it per screen — and `onTaskChanged` is how an edit shows
 * up immediately in a list whose rows are client state.
 */
export interface TaskCellContext {
  scope: TaskScope
  onTaskChanged: (task: TaskRow) => void
  /** Opens the detail drawer over the list. The title cell is the handle. */
  openTask: (task: TaskRow) => void
  /**
   * Where that drawer lives, as an address.
   *
   * The title is a real `<a>` with a real `href`, so a ⌘-click opens the task
   * in a tab and the browser's own "copy link" works — the two things a
   * `<div onClick>` quietly takes away from a list people share out of.
   */
  hrefFor: (task: TaskRow) => string
}

export interface TaskColumn {
  id: TaskColumnId
  header: string
  /**
   * The API field this column can be ordered by, when there is one.
   *
   * Only three of the seven have one, and that is the API's list rather than a
   * choice made here: a header that sorted by something the endpoint cannot
   * order on would be a control that quietly did nothing.
   */
  sort?: TaskSortField
  /**
   * Put on the `<th>` **and** every `<td>` in the column, which is what keeps
   * a responsive column from becoming a header with no cells under it.
   */
  className?: string
  cell: (
    task: TaskRow,
    lookups: TaskLookups,
    context: TaskCellContext,
  ) => React.ReactNode
}

export const TASK_COLUMNS: Record<TaskColumnId, TaskColumn> = {
  key: {
    id: 'key',
    header: 'ID',
    className: 'w-24',
    cell: (task) => <TaskKey>{task.key}</TaskKey>,
  },

  title: {
    id: 'title',
    header: 'Task',
    sort: 'title',
    // The one column allowed to take the leftover width, and the one allowed
    // to wrap out of `whitespace-nowrap` — a truncated title is a task nobody
    // can identify, which is the opposite of what a list is for.
    className: 'w-full max-w-0',
    cell: (task, _lookups, context) => (
      <a
        href={context.hrefFor(task)}
        className="text-text-primary body-2 hover:text-primary-light block truncate"
        onClick={(event) => {
          // A plain click opens the drawer, which is not a navigation: the
          // list behind it keeps its scroll and every row Load more added.
          // Every modified click is left to the browser.
          if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0
          ) {
            return
          }

          event.preventDefault()
          context.openTask(task)
        }}
      >
        {task.title}
      </a>
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
    cell: (task, lookups, context) => {
      const status = lookups.statuses[task.statusId]

      if (status === undefined) {
        return <span className="text-text-disabled body-3">—</span>
      }

      // Editable inside a project and read-only across them, for the same
      // reason as the assignee column: a status id belongs to one board, and
      // `lookups.statuses` only holds the whole board when the screen is one.
      return context.scope.kind === 'project' ? (
        <StatusPicker
          taskId={task.id}
          status={status}
          statuses={Object.values(lookups.statuses)}
          onTaskChanged={context.onTaskChanged}
        />
      ) : (
        <StatusBadge status={status} />
      )
    },
  },

  priority: {
    id: 'priority',
    header: 'Priority',
    sort: 'priority',
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
    header: 'Assignee',
    className: 'hidden sm:table-cell',
    cell: (task, _lookups, context) =>
      // Read-only across projects: assigning needs a project to check
      // membership against, and My Tasks spans several. The picker on a
      // project screen is the same faces with somewhere to put the question.
      context.scope.kind === 'project' ? (
        <AssigneePicker
          projectId={context.scope.projectId}
          taskId={task.id}
          assignees={task.assignees}
          onAssigneesChanged={(assignees) =>
            context.onTaskChanged({ ...task, assignees })
          }
        />
      ) : (
        <AssigneeStack assignees={task.assignees} />
      ),
  },

  dueDate: {
    id: 'dueDate',
    header: 'Due',
    sort: 'dueDate',
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
 *
 * The two lists are written out rather than derived from one another. They
 * differ by more than one entry — a project's board shows priority and no
 * project column, My Tasks the reverse — and a `filter` that produced the
 * wrong *order* while still producing the right *set* is the kind of bug that
 * survives review.
 */
export const DEFAULT_TASK_COLUMNS: TaskColumnId[] = [
  'key',
  'title',
  'project',
  'status',
  'dueDate',
  'assignees',
]

/**
 * Inside one project, the project column is the same value on every row, and
 * priority takes the space it frees.
 */
export const PROJECT_TASK_COLUMNS: TaskColumnId[] = [
  'key',
  'title',
  'priority',
  'status',
  'dueDate',
  'assignees',
]
