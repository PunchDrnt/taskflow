import { Global, Module } from '@nestjs/common'

import { EmailService } from './email.service'
import { EmailTransport } from './email.transport'
import { OutboxWorker } from './outbox.worker'

/**
 * Global because nearly every module ends up announcing something, and the
 * only thing exported is the queue — nobody else touches `notify.outbox`.
 */
@Global()
@Module({
  providers: [EmailTransport, EmailService, OutboxWorker],
  exports: [EmailService],
})
export class NotifyModule {}
