import { subject as tag } from '@casl/ability'
import { Injectable } from '@nestjs/common'

import { ApiException } from '#shared/http/api-exception'

import { defineAbilityFor, type Action, type Subject } from './ability'
import type { Actor } from './actor'

/**
 * The row being asked about. `{}` is valid and means "nothing distinguishes
 * it" — creating the first project of a kind, say. It fails every conditional
 * rule, which is the safe direction.
 */
export type Resource = Record<string, unknown>

/**
 * `can(user, action, resource)` — the one place a permission question is
 * answered, so two endpoints cannot disagree about what an admin may do.
 *
 * See docs/01-architecture.md#permission-hierarchy
 */
@Injectable()
export class PermissionService {
  /**
   * `resource` is required, and that is the whole design.
   *
   * CASL reads a missing subject as "could this person do that to
   * *something*", so a project admin gets `true` for `can('delete', 'Project')`
   * while being allowed to delete only their own. That looks exactly like a
   * permission check that passed. Making the parameter mandatory means the
   * dangerous form does not compile; `isEverAllowedTo` below is the same
   * question asked on purpose.
   */
  can(
    actor: Actor,
    action: Action,
    subject: Subject,
    resource: Resource,
  ): boolean {
    // CASL matches conditions against a tagged object; an untagged one makes
    // every conditional rule silently miss.
    return defineAbilityFor(actor).can(action, tag(subject, resource))
  }

  /**
   * The same question, for a caller that should stop if the answer is no.
   *
   * `ApiException.forbidden` and not `ForbiddenException`: the message on an
   * error body is displayed to a person as it stands (see `ApiErrorBody`), and
   * "Not allowed to delete Organization" is written for whoever is reading a
   * log. What the client needs to *branch* on goes in `details` — the action
   * and subject it just asked about, which it already knows and so cannot
   * learn anything from.
   *
   * The row's id stays out of both. A refusal that names the id confirms it
   * exists, and the codebase answers 404 rather than 403 for a row in another
   * org precisely to avoid saying that.
   */
  assert(
    actor: Actor,
    action: Action,
    subject: Subject,
    resource: Resource,
  ): void {
    if (!this.can(actor, action, subject, resource)) {
      throw ApiException.forbidden('You do not have permission to do that', {
        action,
        subject,
      })
    }
  }

  /**
   * Whether there is *any* row this would be allowed on — for deciding
   * whether a menu item or a button should exist at all.
   *
   * Never an authorisation check. It answers yes for a project admin asked
   * about projects in general, which is correct for drawing a button and
   * wrong for acting on a row.
   */
  isEverAllowedTo(actor: Actor, action: Action, subject: Subject): boolean {
    return defineAbilityFor(actor).can(action, subject)
  }
}
