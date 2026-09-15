/**
 * Which columns a task list draws, as ids.
 *
 * Split from `columns.tsx`, which holds the `cell` function each of these
 * resolves to, because **the ids are the half that crosses boundaries**. A
 * Server Component naming the columns of its list imports this and nothing
 * else; a function cannot be serialised to a client component and cannot be
 * stored in `view.columns` in Phase 4, so the registry stays on the side that
 * draws.
 *
 * Keeping them in one file was not merely untidy: importing an array of
 * strings pulled the whole registry — with its status and assignee pickers,
 * and the Server Actions they call — into every page's graph, which is what
 * made components nobody renders on the server look like client entry points.
 */
export type TaskColumnId =
  'key' | 'title' | 'project' | 'status' | 'priority' | 'assignees' | 'dueDate'

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
