/**
 * Values that are fixed by the spec in `.claude/docs` and consumed by both
 * the API and the web client. Domain zod schemas land here in Phase 0, once
 * the entities they describe actually exist.
 */

/**
 * Deepest `tasks.depth` allowed. 1 means two levels (task + sub-task).
 * Phase 5 may raise this to 2; nothing should hard-code the limit.
 */
export const MAX_TASK_DEPTH = 1

/** Status colours are stored as tokens, never as hex. */
export const STATUS_COLORS = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
] as const

export type StatusColor = (typeof STATUS_COLORS)[number]

/**
 * Task priority, or null for none. No CHECK backs this in the database —
 * nothing indexes or constrains the value — so this list is the whole rule.
 */
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

export type TaskPriority = (typeof TASK_PRIORITIES)[number]

/**
 * Roles inside one organisation. Fixed in code rather than rows in a table:
 * there are three, they never grow, and each one means something the
 * permission rules spell out — a fourth would be a code change anyway.
 *
 * Here rather than in the API because the web renders them: the org switcher
 * shows what you are in each org, and the members table shows everyone's.
 * A list defined on one side only is one the other has to retype, and a
 * client that spells a role differently silently draws the wrong controls.
 *
 * `organization.members.role` is `text`, not an enum, so adding one is not a
 * migration. What "at least one owner" means is enforced by the application —
 * no single-row constraint can express it.
 */
export const ORG_ROLES = ['owner', 'admin', 'member'] as const

export type OrgRole = (typeof ORG_ROLES)[number]

/**
 * Teams and projects have two, not three. A "deputy lead" is another admin,
 * and an owner would have nothing left to own: the org above already has one.
 */
export const SCOPED_ROLES = ['admin', 'member'] as const

export type ScopedRole = (typeof SCOPED_ROLES)[number]
