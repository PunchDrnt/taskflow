import type { OrgRole, TaskPriority } from './constants.js'

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
  projectColor: string
}
