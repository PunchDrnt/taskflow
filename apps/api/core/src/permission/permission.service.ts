import { subject as withSubject } from '@casl/ability'
import { ForbiddenException, Injectable } from '@nestjs/common'

import { defineAbilityFor, type Action, type Subject } from './ability'
import type { Actor } from './actor'

/**
 * `can(user, action, resource)` — the one place a permission question is
 * answered, so two endpoints cannot disagree about what an admin may do.
 *
 * See docs/01-architecture.md#permission-hierarchy
 */
@Injectable()
export class PermissionService {
  /**
   * Pass the resource whenever there is one.
   *
   * Without it the question CASL answers is "could this person do that to
   * *something*", so a project admin gets `true` for `can('delete', 'Project')`
   * even though they may only delete the one project they lead. That is
   * CASL's documented behaviour and it is useful for "should this button
   * exist at all" — it is the wrong question at an endpoint, where the answer
   * needed is about the row in hand.
   */
  can(
    actor: Actor,
    action: Action,
    subject: Subject,
    resource?: Record<string, unknown>,
  ): boolean {
    const ability = defineAbilityFor(actor)

    // CASL matches conditions against a *tagged* object; passing a bare one
    // makes every conditional rule silently miss.
    return resource
      ? ability.can(action, withSubject(subject, resource))
      : ability.can(action, subject)
  }

  /** The same question, for a caller that should stop if the answer is no. */
  assert(
    actor: Actor,
    action: Action,
    subject: Subject,
    resource?: Record<string, unknown>,
  ): void {
    if (!this.can(actor, action, subject, resource)) {
      throw new ForbiddenException(
        `Not allowed to ${action} ${subject}${resource?.id ? ` ${String(resource.id)}` : ''}`,
      )
    }
  }
}
