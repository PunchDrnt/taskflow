import type { AssigneeRow } from '@repo/shared'
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@repo/ui/components/avatar'

/**
 * Who holds a task, as overlapping faces.
 *
 * **Nickname first.** CLAUDE.md's glossary is explicit that Thai colleagues go
 * by their nickname and that the real name is the formal one — so a row that
 * led with `name` would label everybody in a way nobody addresses them.
 *
 * Three faces, then a count. Past three the avatars stop being recognisable
 * and start being a texture; the number is the more useful thing to show, and
 * the full list belongs on the task itself.
 */
const SHOWN = 3

export function AssigneeStack({ assignees }: { assignees: AssigneeRow[] }) {
  if (assignees.length === 0) {
    return <span className="text-text-disabled body-3">Unassigned</span>
  }

  const shown = assignees.slice(0, SHOWN)
  const hidden = assignees.length - shown.length

  return (
    <AvatarGroup>
      {shown.map((person) => {
        const label = displayName(person)

        return (
          <Avatar key={person.userId} size="sm" title={label}>
            {person.avatarUrl !== null && (
              <AvatarImage src={person.avatarUrl} alt={label} />
            )}
            <AvatarFallback>{initial(label)}</AvatarFallback>
          </Avatar>
        )
      })}

      {hidden > 0 && <AvatarGroupCount>+{hidden}</AvatarGroupCount>}
    </AvatarGroup>
  )
}

function displayName(person: AssigneeRow): string {
  return person.nickname ?? person.name ?? 'Unknown'
}

/**
 * The first character, taken by code point.
 *
 * `label[0]` splits a surrogate pair and `label.slice(0, 1)` does the same, so
 * a name starting with an emoji or an astral character renders as half of one.
 * Thai names are in the BMP and would survive either, which is precisely why
 * this is worth doing here rather than after somebody notices.
 */
function initial(label: string): string {
  return [...label][0]?.toUpperCase() ?? '?'
}
