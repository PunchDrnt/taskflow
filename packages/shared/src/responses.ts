import type { OrgRole } from './constants.js'

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
