import type { UserService } from '../iam/user/user.service'
import type { TaskView } from './task.service'

/** One assignee, as a card's avatar row draws them. */
export interface AssigneeView {
  userId: string
  name: string | null
  nickname: string | null
  avatarUrl: string | null
}

/** A task on its way out to a client: ids replaced by people. */
export interface TaskResponse extends Omit<TaskView, 'assigneeIds'> {
  assignees: AssigneeView[]
}

/**
 * Puts names to user ids.
 *
 * Names come from `iam` through its service, never from a join: `task` does
 * not own `iam.users`, and that table has no `org_id` to scope a join by. Same
 * arrangement as the project and organisation member lists.
 *
 * A missing person leaves nulls rather than dropping the row — an id with no
 * user behind it is worth seeing on the screen, not hiding.
 */
export async function namesFor(
  users: UserService,
  userIds: string[],
): Promise<AssigneeView[]> {
  const people = await users.findByIds([...new Set(userIds)])
  const byId = new Map(people.map((person) => [person.id, person]))

  return userIds.map((userId) => {
    const person = byId.get(userId)

    return {
      userId,
      name: person?.name ?? null,
      nickname: person?.nickname ?? null,
      avatarUrl: person?.avatarUrl ?? null,
    }
  })
}

/**
 * Attaches names to the assignee ids a page of tasks carries.
 *
 * One `findByIds` for a whole board rather than one per card — the N+1 that
 * only shows itself once a project has a few hundred tasks.
 */
export async function withAssignees<T extends TaskView>(
  users: UserService,
  tasks: T[],
): Promise<(Omit<T, 'assigneeIds'> & { assignees: AssigneeView[] })[]> {
  const everyone = await namesFor(
    users,
    tasks.flatMap((task) => task.assigneeIds),
  )
  const byId = new Map(everyone.map((person) => [person.userId, person]))

  return tasks.map(({ assigneeIds, ...task }) => ({
    ...task,
    assignees: assigneeIds.map(
      (userId) =>
        byId.get(userId) ?? {
          userId,
          name: null,
          nickname: null,
          avatarUrl: null,
        },
    ),
  }))
}
