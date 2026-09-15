import type { ActivityRow, AssigneeRow, StatusRow } from '@repo/shared'

import { initialOf, UserAvatar } from '@/components/molecules/user-avatar'
import { formatDay, formatTimeOfDay } from '@/lib/format/due-date'

/**
 * What has happened to this task, newest first.
 *
 * The audit log read back, which is the whole of the checklist's "activity log
 * ที่ไม่มีใครอ่านได้ไม่ใช่ฟีเจอร์" — the rows have been written since Phase 0
 * and this is the first screen that shows them.
 *
 * **Comments are not here, and the panel does not pretend they are.** The
 * design's version of this panel is headed "Comments & activity" with a
 * composer at the bottom; comments are Phase 2, and a composer that posted
 * nowhere would be worse than an absent one.
 *
 * ⚠️ **Sentences are built here, not by the API.** A row records
 * `{ field: { from, to } }` and nothing else, on purpose: the ids in it mean
 * different things to different readers — a status id is a column name only to
 * somebody who can see that board — and rendering the words on the server
 * would freeze them into the log forever.
 */
export function TaskActivity({
  entries,
  statuses,
  assignees,
}: {
  entries: ActivityRow[]
  /** For naming the column a `statusId` points at. */
  statuses: StatusRow[]
  /** Who holds the task now, which names most of the ids the feed mentions. */
  assignees: AssigneeRow[]
}) {
  if (entries.length === 0) {
    return (
      <p className="text-text-disabled body-3 px-4 py-6 text-center">
        Nothing has happened to this task yet.
      </p>
    )
  }

  const names = namesFrom(entries, assignees)
  const columns = new Map(statuses.map((status) => [status.id, status.name]))

  return (
    <ol className="flex flex-col px-4 pb-5">
      {entries.map((entry, index) => (
        <li key={entry.id}>
          {/* A heading only when the day changes. The rows arrive newest
              first, so comparing with the one before is comparing with the
              day above — no sorting, no second pass. */}
          {dayOf(entry) !== dayOf(entries[index - 1]) && (
            <p className="text-text-disabled body-3 flex items-center gap-2.5 pt-3.5 pb-2 uppercase">
              {formatDay(entry.occurredAt)}
              <span aria-hidden className="bg-divider h-px flex-1" />
            </p>
          )}

          <div className="flex items-start gap-2.5 py-1.5">
            <UserAvatar
              size="sm"
              userId={entry.actor.userId}
              avatarUrl={entry.actor.avatarUrl}
              fallback={initialOf(displayName(entry.actor))}
              className="mt-0.5 shrink-0"
            />

            <p className="text-text-secondary body-3 min-w-0 flex-1">
              <span className="text-text-primary font-medium">
                {displayName(entry.actor)}
              </span>{' '}
              {sentence(entry, names, columns)}{' '}
              <span className="text-text-disabled tabular-nums">
                {formatTimeOfDay(entry.occurredAt)}
              </span>
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function dayOf(entry: ActivityRow | undefined): string | null {
  return entry === undefined ? null : formatDay(entry.occurredAt)
}

/** Nickname first — CLAUDE.md's glossary: it is what colleagues call them. */
export function displayName(person: AssigneeRow): string {
  return person.nickname ?? person.name ?? 'Somebody'
}

/**
 * Ids the feed can put a name to: everyone who acted, and everyone who holds
 * the task now.
 *
 * Deliberately not a fetch of the project's members. `/assignable` caps its
 * answer, so it would leave gaps of its own while adding a request to every
 * open — and the gap it would close is narrow: somebody assigned and then
 * unassigned who never did anything else. Those read as "somebody", which is
 * true, rather than as a UUID, which is not readable by anyone.
 */
export function namesFrom(
  entries: ActivityRow[],
  assignees: AssigneeRow[],
): Map<string, string> {
  const names = new Map<string, string>()

  for (const person of assignees) names.set(person.userId, displayName(person))
  for (const entry of entries) {
    names.set(entry.actor.userId, displayName(entry.actor))
  }

  return names
}

/** What the actor did, as the rest of the sentence their name starts. */
function sentence(
  entry: ActivityRow,
  names: Map<string, string>,
  columns: Map<string, string>,
): string {
  const person = (value: unknown) =>
    typeof value === 'string' ? (names.get(value) ?? 'somebody') : 'somebody'

  switch (entry.action) {
    case 'created':
      return 'created this task'
    case 'deleted':
      return 'deleted this task'
    case 'assigned':
      return `assigned ${person(movement(entry.changes.assigneeId)?.to)}`
    case 'unassigned':
      return `unassigned ${person(movement(entry.changes.assigneeId)?.from)}`
    default:
      return edits(entry, columns).join(' · ')
  }
}

/**
 * One clause per field that moved.
 *
 * `completedAt` and `completedBy` are left out on purpose: they are not edits
 * anybody made, they are what the API stamps when a task lands in a column
 * that counts as done. Reporting them would say the same thing twice, once in
 * words the reader chose and once in columns they have never heard of.
 */
function edits(entry: ActivityRow, columns: Map<string, string>): string[] {
  const clauses: string[] = []

  for (const [field, value] of Object.entries(entry.changes)) {
    const change = movement(value)

    // A field whose recorded shape is not `{ from, to }` at all. Nothing
    // writes one today, but `audit.logs` is never deleted from, so a row from
    // a version that did would otherwise take the whole panel down with it.
    if (change === null) continue

    switch (field) {
      case 'title':
        clauses.push(`renamed it to “${text(change.to)}”`)
        break
      case 'description':
        clauses.push(
          change.to === null || change.to === ''
            ? 'removed the description'
            : 'edited the description',
        )
        break
      case 'statusId':
        clauses.push(
          `moved it to ${
            typeof change.to === 'string'
              ? (columns.get(change.to) ?? 'another column')
              : 'another column'
          }`,
        )
        break
      case 'priority':
        clauses.push(
          change.to === null
            ? 'cleared the priority'
            : `set priority to ${text(change.to)}`,
        )
        break
      case 'dueDate':
        clauses.push(
          typeof change.to === 'string'
            ? `set the due date to ${formatDay(change.to)}`
            : 'cleared the due date',
        )
        break
      case 'sortOrder':
        clauses.push('reordered it')
        break
      case 'completedAt':
      case 'completedBy':
        break
      default:
        clauses.push(`changed ${field}`)
    }
  }

  // An `updated` row always has at least one change — `TaskService.update`
  // returns early when nothing moved — but every clause above can be skipped,
  // and a row with no sentence would draw a name and a time and nothing else.
  return clauses.length === 0 ? ['changed this task'] : clauses
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

/**
 * One recorded change, if that is what this is.
 *
 * `changes` comes out of a `jsonb` column with no guarantee beyond having been
 * written by some version of this application — see `ActivityRow`. Reading
 * `.to` off a `null` in there is the crash this prevents.
 */
function movement(value: unknown): { from: unknown; to: unknown } | null {
  return typeof value === 'object' && value !== null && 'to' in value
    ? (value as { from: unknown; to: unknown })
    : null
}
