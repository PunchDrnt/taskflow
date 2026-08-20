import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { StorageService } from '../src/modules/storage/storage.service'

/**
 * The bucket is private and files reach the browser only through a presigned
 * URL that expires. That is the claim the whole storage design rests on, and
 * the code cannot assert it about itself — it has to be tried.
 *
 * Skips when MinIO is not configured, the same bargain the database suites
 * make — and like them, configured-but-unreachable is a failure, not a skip.
 * A suite that passes without asserting is worse than no suite.
 */
const storage = new StorageService({
  get: (key: string) => {
    const raw = process.env[key]
    if (key === 'MINIO_PORT') return Number(raw ?? 9000)
    if (key === 'MINIO_USE_SSL') return raw === 'true'
    return raw
  },
} as never)

const configured = Boolean(process.env.MINIO_ENDPOINT)

describe.skipIf(!configured)('storage', () => {
  const key = `test-org/task/${crypto.randomUUID()}/hello.txt`
  const body = 'attachment contents'

  beforeAll(async () => {
    await storage.onModuleInit()
  }, 30_000)

  afterAll(async () => {
    await storage.remove(key).catch(() => undefined)
  })

  it('round-trips a file through presigned URLs', async () => {
    const upload = await storage.presignedUpload(key)
    expect((await fetch(upload, { method: 'PUT', body })).ok).toBe(true)

    const download = await storage.presignedDownload(key)
    expect(await (await fetch(download)).text()).toBe(body)
  })

  it('refuses the same object without a signature', async () => {
    // Strip the query string and what is left is the plain object URL. A
    // public bucket would serve it, and every attachment in every org would
    // be readable by anyone who had ever seen one link.
    const signed = new URL(await storage.presignedDownload(key))

    const response = await fetch(`${signed.origin}${signed.pathname}`)
    expect(response.status).toBe(403)
  })

  it('expires a presigned URL', async () => {
    const url = await storage.presignedUpload(key, 1)
    await new Promise((resolve) => setTimeout(resolve, 1500))

    expect((await fetch(url, { method: 'PUT', body })).status).toBe(403)
  })
})

describe('storage keys', () => {
  it('leads with the organisation', () => {
    const built = storage.keyFor('org-1', 'task', 'task-1', 'ใบเสร็จ 2026.pdf')

    // Org first, so a misdirected key reads as a wrong prefix rather than an
    // anonymous uuid, and one org's objects can be listed together.
    expect(built.startsWith('org-1/task/task-1/')).toBe(true)
    // The uuid keeps two uploads of the same filename apart.
    expect(built).toMatch(/[0-9a-f-]{36}-/)
  })
})
