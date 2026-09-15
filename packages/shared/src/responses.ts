import type {
  OrgRole,
  ScopedRole,
  StatusColor,
  TaskPriority,
} from './constants.js'
import type { StatusKind } from './schemas/status.js'

/**
 * Response shapes both halves read.
 *
 * Here rather than beside the controller that builds them, for the reason
 * `Page<T>` and `ApiErrorBody` are here: the web client has to name what comes
 * back, and re-declaring it there would be two definitions of one contract,
 * drifting silently the first time a field is added. The API imports these and
 * builds to them, so the compiler catches the drift instead.
 *
 * Types only — no zod. These describe what the API *sends*, which nothing
 * validates on the way out; the schemas in `schemas/` describe what it
 * accepts, which is where validation belongs.
 */

/** One organisation a person may act for, with what the picker needs to draw it. */
export interface Membership {
  orgId: string
  name: string
  slug: string
  /** Their role in *this* org, which differs from org to org. */
  role: OrgRole
}

/** What `GET /v1/me` answers with, and what `PATCH /v1/me` echoes back. */
export interface Me {
  id: string
  email: string
  username: string
  name: string
  nickname: string
  phone: string | null
  avatarUrl: string | null
  status: string
  /** Whether a second factor stands between this account and a session. */
  twoFactorEnabled: boolean
  organizations: Membership[]
  /** Null while the caller is in several organisations and has picked none. */
  activeOrgId: string | null
  /** The caller's role in `activeOrgId`, null when there is no active org. */
  role: OrgRole | null
}

/**
 * A date-time **as it arrives in a browser**: an ISO 8601 string.
 *
 * The API's own view types say `Date`, and they are right to — a service
 * hands back what came out of `timestamptz`. But `JSON.stringify` turns a
 * `Date` into a string on the way out and nothing turns it back, so a client
 * that reused the server's type would be told it has a `Date` and get a
 * string. Calling `.getTime()` on it throws at runtime with the compiler
 * satisfied, which is the worst shape a mistake can take.
 *
 * So the wire types below are declared once, here, and are deliberately *not*
 * the API's types with the dates left alone.
 */
export type IsoDateTime = string

/** One assignee, as a card's avatar row draws them. */
export interface AssigneeRow {
  userId: string
  name: string | null
  nickname: string | null
  avatarUrl: string | null
}

/** A task as it reaches a browser. Mirrors the API's `TaskResponse`. */
export interface TaskRow {
  id: string
  projectId: string
  /** `DEV-120`, assembled by the API and never stored. */
  key: string
  number: number
  title: string
  description: string | null
  statusId: string
  priority: TaskPriority | null
  dueDate: IsoDateTime | null
  sortOrder: string
  completedAt: IsoDateTime | null
  completedBy: string | null
  assignees: AssigneeRow[]
}

/**
 * A row from `GET /v1/me/tasks`, which spans organisations and so has to name
 * the one each task belongs to.
 */
export interface MyWorkRow extends TaskRow {
  orgId: string
  orgName: string
  projectName: string
  /** One of the eight palette tokens, never a hex value. */
  projectColor: StatusColor
}

/**
 * One line of a task's activity panel.
 *
 * The wire twin of the API's `ActivityEntry`, which says `Date` where this says
 * `IsoDateTime` — see `IsoDateTime` for why the two are declared apart rather
 * than shared with the dates left alone.
 *
 * `changes` is `audit.logs.changes_json` verbatim: one entry per field that
 * moved, written as `{ from, to }`. It is deliberately not a pre-rendered
 * sentence — the API does not know which of the ids in it the reader can put a
 * name to, and the screen does.
 *
 * ⚠️ **`unknown` per field, and not the `{ from, to }` it is written as.** The
 * column is `jsonb` and the table is never deleted from, so what comes back is
 * whatever some version of the code put there — a field that has since been
 * renamed, a shape from before a writer changed. `AuditLog.changesJson` takes
 * the same position on the server. Whoever renders a line narrows it.
 */
export interface ActivityRow {
  id: string
  /** `created` · `updated` · `assigned` · `unassigned` · `deleted`. */
  action: string
  occurredAt: IsoDateTime
  changes: Record<string, unknown>
  /** Who did it. Names come from `iam` through its service, never a join. */
  actor: AssigneeRow
}

/** The organisation a session is acting for, as its settings screen draws it. */
export interface OrganizationRow {
  id: string
  name: string
  slug: string
}

/**
 * One person in an organisation.
 *
 * The membership and the account, joined by the API rather than by the
 * database: `iam.users` has no `org_id` and this module does not own it, so
 * the names come from `UserService` and are null when the account has been
 * anonymised while the membership row remains.
 */
export interface OrgMemberRow {
  userId: string
  role: OrgRole
  joinedAt: IsoDateTime
  name: string | null
  nickname: string | null
  email: string | null
  avatarUrl: string | null
  /**
   * `active` · `deactivated`. Account-level, not per organisation — which is
   * why switching somebody off is refused when they belong to more than one.
   * A deactivated colleague stays in this list, and that is the whole
   * difference between switching an account off and removing a person.
   */
  status: string | null
}

/**
 * A project as a sidebar, a picker or a list row draws it.
 *
 * `archivedAt` is a string here and a `Date` on the API's `ProjectView`, for
 * the reason `IsoDateTime` exists at all.
 */
export interface ProjectRow {
  id: string
  name: string
  description: string | null
  color: StatusColor
  /** `DEV` — the first half of every task key in this project. */
  keyPrefix: string
  /** Non-null means hidden from sidebars and pickers, not deleted. */
  archivedAt: IsoDateTime | null
  /**
   * What the caller is *in this project*, or null when they are not in it and
   * are seeing it because they run the organisation.
   */
  role: ScopedRole | null
}

/**
 * One column of one project's board.
 *
 * Statuses are per project, which is why anything listing tasks from several
 * projects at once has to hold a map keyed by `id` rather than a single list:
 * two projects' "In progress" are two rows with two ids.
 */
export interface StatusRow {
  id: string
  name: string
  color: StatusColor
  /** `done` and `cancelled` are what `includeClosed=false` hides. */
  kind: StatusKind
  /** Where a new task lands. Exactly one per project. */
  isDefault: boolean
  sortOrder: string
  /**
   * Live tasks in this status.
   *
   * On the wire because the settings screen has to show two rules before
   * somebody acts on them, not after: a status holding work cannot be
   * deleted, and changing what one counts as rewrites the completion of
   * everything in it.
   */
  taskCount: number
}

/**
 * Somebody a project can hand work to, as the assignee picker draws them.
 *
 * Both names on every row, never one. A hundred-person company has repeated
 * first names and repeated nicknames, and the picker's failure mode is
 * assigning work to the wrong Pim — so the row carries the formal name, the
 * nickname colleagues actually use, and the email that settles it.
 */
export interface AssignableRow {
  userId: string
  name: string
  nickname: string
  email: string
  avatarUrl: string | null
  /** False means picking them asks to add them to the project first. */
  inProject: boolean
}
