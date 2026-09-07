import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { requireOrgContext } from '#shared/org-scope/request-context'
import { SYSTEM_USER_ID } from '#shared/system-user'

import { Outbox } from './outbox.entity'

export interface Notification {
  recipientId: string
  /** A key into templates.ts, resolved when the worker sends it. */
  template: string
  payload?: Record<string, unknown>
  /** 'email' today; 'discord' and 'line' arrive with their adapters. */
  channel?: string
}

/**
 * Queues a notification. Nothing here sends anything — OutboxWorker does that
 * afterwards, which is the point.
 *
 * Written in the caller's transaction, like the activity log and for a weaker
 * version of the same reason: an email that goes out for a change that then
 * rolled back is worse than one that arrives late. Sending inside the
 * transaction would be worse still, since Resend cannot be rolled back.
 */
@Injectable()
export class EmailService {
  async enqueue(
    manager: EntityManager,
    notification: Notification,
  ): Promise<void> {
    this.requireTransaction(manager, 'enqueue')

    const { orgId, userId } = requireOrgContext()

    await this.write(manager, notification, orgId, userId)
  }

  /**
   * Queues a message that belongs to the *account*, not to any organisation —
   * `org_id` null, attributed to the system user.
   *
   * Password reset is the case it exists for, and it is not a shortcut around
   * `enqueue`: that endpoint is `@Public()`, so there is no signed-in caller to
   * attribute the row to, and the recipient may belong to several
   * organisations or to none. Choosing one would file a message about somebody's
   * *login* under a company that has nothing to do with it.
   *
   * Still requires the caller's transaction, for the same reason `enqueue`
   * does: the queued row has to commit with the token it announces, or a
   * person gets a link for a reset that rolled back.
   */
  async enqueueSystem(
    manager: EntityManager,
    notification: Notification,
  ): Promise<void> {
    this.requireTransaction(manager, 'enqueueSystem')

    await this.write(manager, notification, null, SYSTEM_USER_ID)
  }

  private async write(
    manager: EntityManager,
    notification: Notification,
    orgId: string | null,
    actorId: string,
  ): Promise<void> {
    // jsonb: TypeORM's QueryDeepPartialEntity walks into the object and does
    // not know what to make of `unknown` values, so the column is handed over
    // whole rather than described field by field.
    await manager.insert(Outbox, {
      orgId,
      recipientId: notification.recipientId,
      channel: notification.channel ?? 'email',
      template: notification.template,
      payloadJson: (notification.payload ?? {}) as never,
      status: 'pending',
      createdBy: actorId,
      updatedBy: actorId,
    })
  }

  private requireTransaction(manager: EntityManager, method: string): void {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error(
        `EmailService.${method} needs the EntityManager of an open ` +
          'transaction — the queued row has to commit with the change it ' +
          'announces.',
      )
    }
  }
}
