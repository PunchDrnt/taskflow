import type { DataSource } from 'typeorm'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { EmailService } from '../src/modules/notify/email.service'
import type { EmailTransport } from '../src/modules/notify/email.transport'
import {
  BACKOFF_BASE_SECONDS,
  MAX_ATTEMPTS,
  OutboxWorker,
} from '../src/modules/notify/outbox.worker'
import { runWithRequestContext } from '../src/shared/request-context'
import { SYSTEM_USER_ID } from '../src/shared/system-user'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

/**
 * The outbox exists so that a send that fails cannot roll back the change it
 * was announcing, and so that one that never happens is visible afterwards
 * rather than lost.
 */
describe.skipIf(!hasTestDatabase)('notification outbox', () => {
  let dataSource: DataSource
  let email: EmailService
  let orgId: string

  const sent: { to: string; subject: string }[] = []
  let failWith: Error | null = null

  const transport = {
    send: vi.fn(async (message: { to: string; subject: string }) => {
      if (failWith) throw failWith
      sent.push(message)
    }),
  } as unknown as EmailTransport

  const worker = () =>
    new OutboxWorker(dataSource, transport, {
      get: () => true,
    } as never)

  const asOrg = <R>(fn: () => R): R =>
    runWithRequestContext({ orgId, userId: SYSTEM_USER_ID }, fn)

  const queue = (template = 'task_assigned') =>
    asOrg(() =>
      dataSource.transaction((manager) =>
        email.enqueue(manager, {
          recipientId: SYSTEM_USER_ID,
          template,
          payload: { taskId: 'abc' },
        }),
      ),
    )

  const rows = async (): Promise<
    { status: string; attempts: number; last_error: string | null }[]
  > =>
    (await dataSource.query(
      `SELECT status, attempts, last_error FROM notify.outbox ORDER BY created_at`,
    )) as { status: string; attempts: number; last_error: string | null }[]

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()
    email = new EmailService()

    const [org] = (await dataSource.query(
      `INSERT INTO organization.organizations (name, slug, created_by, updated_by)
       VALUES ('outbox', 'outbox', $1, $1) RETURNING id`,
      [SYSTEM_USER_ID],
    )) as { id: string }[]
    orgId = org.id
  }, 60_000)

  afterAll(async () => {
    await dataSource?.destroy()
  })

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM notify.outbox`)
    sent.length = 0
    failWith = null
  })

  describe('queueing', () => {
    it('refuses a manager that is not in a transaction', async () => {
      await expect(
        asOrg(() =>
          email.enqueue(dataSource.manager, {
            recipientId: SYSTEM_USER_ID,
            template: 'task_assigned',
          }),
        ),
      ).rejects.toThrow(/open transaction/)
    })

    it('rolls back with the change it announces', async () => {
      await expect(
        asOrg(() =>
          dataSource.transaction(async (manager) => {
            await email.enqueue(manager, {
              recipientId: SYSTEM_USER_ID,
              template: 'task_assigned',
            })
            throw new Error('the change did not stand')
          }),
        ),
      ).rejects.toThrow('did not stand')

      expect(await rows()).toEqual([])
    })

    it('sends nothing by itself', async () => {
      await queue()

      // The whole point of the pattern: enqueue touches the database only.
      expect(sent).toEqual([])
      expect((await rows())[0]!.status).toBe('pending')
    })
  })

  describe('delivering', () => {
    it('sends a pending row and marks it', async () => {
      await queue()

      expect(await worker().drain()).toBe(1)
      expect(sent).toHaveLength(1)
      expect(sent[0]!.to).toContain('@')
      expect((await rows())[0]!.status).toBe('sent')
    })

    it('does not send the same row twice', async () => {
      await queue()
      await worker().drain()
      await worker().drain()

      expect(sent).toHaveLength(1)
    })

    it('leaves a failed row pending, with the reason on it', async () => {
      await queue()
      failWith = new Error('mailbox full')

      expect(await worker().drain()).toBe(0)

      const [row] = await rows()
      expect(row!.status).toBe('pending')
      expect(row!.attempts).toBe(1)
      expect(row!.last_error).toBe('mailbox full')
    })

    it('waits before trying again', async () => {
      await queue()
      failWith = new Error('down')
      await worker().drain()

      // Straight back in would hammer a service that is already struggling.
      failWith = null
      expect(await worker().drain()).toBe(0)
      expect(sent).toEqual([])
    })

    it('gives up after the last attempt rather than retrying forever', async () => {
      await queue()
      failWith = new Error('permanently rejected')

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        await worker().drain()
        // Skip the backoff the way time would.
        await dataSource.query(
          `UPDATE notify.outbox
              SET updated_at = now() - make_interval(secs => $1 * power(5, attempts)::int + 1)`,
          [BACKOFF_BASE_SECONDS],
        )
      }

      const [row] = await rows()
      expect(row!.attempts).toBe(MAX_ATTEMPTS)
      // 'failed' is a terminal state: nothing retries it, so the row is the
      // record that someone was never told.
      expect(row!.status).toBe('failed')

      failWith = null
      expect(await worker().drain()).toBe(0)
    })

    it('sends a message whose template does not exist yet', async () => {
      await queue('a_template_nobody_has_written')

      // A missing template must not put the row into a retry loop.
      expect(await worker().drain()).toBe(1)
      expect(sent[0]!.subject).toContain('a_template_nobody_has_written')
    })
  })
})
