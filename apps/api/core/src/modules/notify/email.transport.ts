import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Resend } from 'resend'

import type { Env } from '../../config/env'

export interface OutgoingEmail {
  to: string
  subject: string
  text: string
}

/**
 * Sends, or writes to the log when there is no Resend key.
 *
 * The fallback is a development affordance and nothing more: `env.ts` refuses
 * to boot in production without a key, so notifications cannot quietly go to
 * stdout on a real deployment.
 */
@Injectable()
export class EmailTransport {
  private readonly logger = new Logger(EmailTransport.name)
  private readonly resend: Resend | null
  private readonly from: string

  constructor(config: ConfigService<Env, true>) {
    const key = config.get('RESEND_API_KEY', { infer: true })
    this.from = config.get('EMAIL_FROM', { infer: true })
    this.resend = key ? new Resend(key) : null

    if (!this.resend) {
      this.logger.warn(
        'RESEND_API_KEY is unset: email will be written to the log instead ' +
          'of sent. Production refuses to boot in this state.',
      )
    }
  }

  async send(email: OutgoingEmail): Promise<void> {
    if (!this.resend) {
      this.logger.log({ email }, 'Email (not sent — no transport configured)')
      return
    }

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
    })

    // The SDK reports failure in the result rather than by throwing, so an
    // unchecked call looks like a successful send.
    if (error) {
      throw new Error(`Resend refused the message: ${error.message}`)
    }
  }
}
