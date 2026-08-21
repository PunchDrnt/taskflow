import type { ConfigService } from '@nestjs/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '../../config/env'
import { EmailTransport } from './email.transport'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('resend', () => ({
  // A class, not vi.fn(): the transport calls `new Resend(key)`, and SWC's
  // output is not constructible from a plain mock function.
  Resend: class {
    emails = { send }
  },
}))

/**
 * The transport is the last thing between a queued row and a person being
 * told, and it is the one piece `outbox.spec.ts` replaces with a fake — so
 * nothing else in the suite ever runs this code.
 */
const configWith = (key: string | undefined) =>
  ({
    get: (name: keyof Env) =>
      name === 'RESEND_API_KEY' ? key : 'Taskflow <noreply@taskflow.local>',
  }) as unknown as ConfigService<Env, true>

const message = { to: 'someone@example.com', subject: 'hi', text: 'body' }

describe('EmailTransport', () => {
  beforeEach(() => send.mockReset())

  it('throws when Resend refuses the message', async () => {
    // The SDK reports failure in the result rather than by throwing, so an
    // unchecked call looks exactly like a successful send — and OutboxWorker
    // would mark the row 'sent'. Nobody is told, and nothing says so.
    send.mockResolvedValue({ error: { message: 'domain not verified' } })

    await expect(
      new EmailTransport(configWith('re_test')).send(message),
    ).rejects.toThrow(/domain not verified/)
  })

  it('resolves when Resend accepts it, and passes the message through', async () => {
    send.mockResolvedValue({ error: null, data: { id: 'abc' } })

    await new EmailTransport(configWith('re_test')).send(message)

    expect(send).toHaveBeenCalledWith({
      from: 'Taskflow <noreply@taskflow.local>',
      to: message.to,
      subject: message.subject,
      text: message.text,
    })
  })

  it('writes to the log instead of sending when there is no key', async () => {
    // A developer with no Resend account still has to be able to boot; env.ts
    // is what stops this reaching production.
    await new EmailTransport(configWith(undefined)).send(message)

    expect(send).not.toHaveBeenCalled()
  })
})
