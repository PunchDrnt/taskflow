import type {
  ActivityRow,
  ProjectRow,
  StatusRow,
  TaskPriority,
  TaskRow,
} from '@repo/shared'

/**
 * Everything the detail drawer draws, for one task.
 *
 * Gathered in one place because the list a drawer opens over cannot supply it.
 * A row carries `statusId` and `projectId` and no names, and `lookups.statuses`
 * holds the statuses of every project on the page in one flat map — a
 * `StatusRow` has no `projectId`, so there is no way to ask it which of those
 * belong to *this* task's board. The drawer therefore fetches the board rather
 * than filtering something that cannot be filtered.
 */
export interface TaskDetail {
  task: TaskRow
  /**
   * Null when the caller can no longer see the project the task is in.
   *
   * Not an error, for the same reason the list's project column draws a dash:
   * somebody removed from a project between two requests still has the task in
   * hand, and inventing a name for a board they cannot open would be worse.
   */
  project: ProjectRow | null
  /** Every column of the task's own board, in board order. */
  statuses: StatusRow[]
  /** Newest first, the way `GET /v1/tasks/:id/activity` answers. */
  activity: ActivityRow[]
}

/**
 * What the drawer may change, as the API's own field names.
 *
 * A subset of `updateTaskSchema`: `afterId` is a board move and belongs to a
 * drag, not to a panel. `null` means "clear this" and `undefined` means "leave
 * it alone", which is the distinction the schema is built around — dropping it
 * would make clearing a due date impossible to express.
 */
export interface TaskPatch {
  title?: string
  description?: string | null
  priority?: TaskPriority | null
  /** An ISO 8601 instant **with an offset**, never a bare calendar day. */
  dueDate?: string | null
  statusId?: string
}

export type TaskDetailOutcome =
  { ok: true; detail: TaskDetail } | { ok: false; message: string }

/** The whole task comes back: an edit can also stamp its completion columns. */
export type TaskEditOutcome =
  { ok: true; task: TaskRow } | { ok: false; message: string }
