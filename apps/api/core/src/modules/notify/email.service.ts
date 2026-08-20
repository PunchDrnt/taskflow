import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { requireRequestContext } from '../../shared/request-context'
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
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error(
        'EmailService.enqueue needs the EntityManager of an open transaction ' +
          '— the queued row has to commit with the change it announces.',
      )
    }

    const { orgId, userId } = requireRequestContext()

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
      createdBy: userId,
      updatedBy: userId,
    })
  }
}
