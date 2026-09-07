import { Injectable } from '@nestjs/common'
import { IsNull, type EntityManager } from 'typeorm'

import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { requireOrgContext } from '#shared/org-scope/request-context'

import { Task } from './task.entity'

/**
 * Tasks. Phase 1 §6 fills this in; what is here is the two questions the
 * *status* settings screen has to ask about tasks, and nothing else.
 *
 * They live here rather than in `project/` because `task.tasks` belongs to
 * this module. A status service reaching into the tasks table directly would
 * be the module boundary meaning nothing — the same rule that keeps
 * `organization/` out of `iam.users`. The methods are named for what tasks
 * know, not for what the caller wants to conclude from the answer.
 */
@Injectable()
export class TaskService {
  constructor(
    @InjectOrgRepository(Task)
    private readonly tasks: OrgScopedRepository<Task>,
  ) {}

  /** How many live tasks sit in this status. */
  countInStatus(statusId: string): Promise<number> {
    return this.tasks.count({ where: { statusId, deletedAt: IsNull() } })
  }

  /**
   * Brings `completed_at` / `completed_by` back into agreement with what a
   * status now counts as, for every live task in it. Returns the rows changed.
   *
   * 🔒 **This is the half of the rule that gets forgotten.** A task's
   * completion has to agree with its status's `is_done_type` in both
   * directions: when a task moves between statuses (§6), and when somebody
   * edits the *status* under tasks that are already in it. The second is the
   * easy one to miss, because the person doing it is looking at a settings
   * screen and not at a single task — and no CHECK can catch it, since the
   * condition spans `task.tasks` and `project.statuses`.
   *
   * Left alone, a project ends up with tasks that report a completion date
   * while sitting in a column that does not mean finished — and every count,
   * burndown and "what did we ship" query disagrees with the board.
   *
   * Both columns move together, which `tasks_completed_pair_check` requires;
   * the actor is credited, because they are who caused it.
   */
  async reconcileCompletion(
    manager: EntityManager,
    statusId: string,
    counted: boolean,
  ): Promise<number> {
    const { orgId, userId } = requireOrgContext()

    const [, affected] = (await manager.query(
      `UPDATE task.tasks
          SET completed_at = ${counted ? 'now()' : 'NULL'},
              completed_by = ${counted ? '$1' : 'NULL'},
              updated_at   = now(),
              updated_by   = $1
        WHERE org_id = $2
          AND status_id = $3
          AND deleted_at IS NULL
          -- Only the rows that actually disagree, so re-running changes
          -- nothing and a task already completed keeps the date it had.
          AND completed_at IS ${counted ? 'NULL' : 'NOT NULL'}`,
      [userId, orgId, statusId],
    )) as [unknown, number]

    return affected
  }
}
