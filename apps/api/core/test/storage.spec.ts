import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { StorageService } from '../src/modules/storage/storage.service'

/**
 * The bucket is private and files reach the browser only through a presigned
 * URL that expires. That is the claim the whole storage design rests on, and
 * the code cannot assert it about itself — it has to be tried.
 *
 * Skips when object storage is not configured, the same bargain the database
 * suites make — and like them, configured-but-unreachable is a failure, not a
 * skip. A suite that passes without asserting is worse than no suite.
 */
const storage = new StorageService({
  get: (key: string) => {
    const raw = process.env[key]
    if (key === 'S3_PORT') return Number(raw ?? 4900)
    if (key === 'S3_USE_SSL') return raw === 'true'
    return raw
  },
} as never)

const configured = Boolean(process.env.S3_HOST)

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

    const response = await fetch(url, { method: 'PUT', body })

    // Rejected, not 403 specifically: Garage answers 400 "Date is too old"
    // where MinIO answered 403. Pinning the code would tie the suite to one
    // implementation of a thing every S3 server does differently.
    expect(response.ok).toBe(false)
    expect(response.status).toBeGreaterThanOrEqual(400)
  })

  /**
   * The browser sends its avatar straight here, which makes it cross-origin.
   *
   * Nothing in the application can check this: the rule lives on the bucket,
   * is put there by `deploy/init/garage.sh`, and the only way to know it took
   * is to send the preflight a browser would send. A missing rule fails in the
   * browser before the PUT leaves it, with no request to find in any log —
   * which is exactly the kind of thing a suite should catch instead.
   *
   * Not skipped when the variable is absent. The default matches the init
   * script's own default, so "nobody set it" tests what a default install
   * actually does rather than quietly asserting nothing.
   */
  const allowed = (process.env.S3_CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')[0]!
    .trim()

  const preflight = (origin: string, method = 'PUT'): Promise<Response> =>
    storage.presignedUpload(key).then((url) =>
      fetch(url, {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': method,
          'access-control-request-headers': 'content-type',
        },
      }),
    )

  it('lets the configured origin preflight an upload', async () => {
    const response = await preflight(allowed)

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe(allowed)
    expect(response.headers.get('access-control-allow-methods')).toContain(
      'PUT',
    )
  })

  it('🔒 does not allow any other origin, or any other method', async () => {
    // A rule of `*` would work just as well for the app and hand every page
    // on the internet a signed-URL-shaped hole to aim at. And PUT is all the
    // browser does here — the download side is an `<img>` following a
    // redirect, which is not a cross-origin fetch at all.
    expect((await preflight('https://not-the-app.example')).status).toBe(403)
    expect((await preflight(allowed, 'DELETE')).status).toBe(403)
  })
})

describe('storage keys', () => {
  it('leads with the organisation', () => {
    const built = storage.keyFor('org-1', 'task', 'task-1', 'report.pdf')

    // Org first, so a misdirected key reads as a wrong prefix rather than an
    // anonymous uuid, and one org's objects can be listed together.
    expect(built.startsWith('org-1/task/task-1/')).toBe(true)
    // The uuid keeps two uploads of the same filename apart.
    expect(built).toMatch(/[0-9a-f-]{36}-/)
  })

  it('keeps a Thai filename readable, marks and all', () => {
    // The whole reason the name is kept is that a person can read it. \w
    // turned "ใบเสร็จ 2026.pdf" into "_2026.pdf", and \p{L}\p{N} without
    // \p{M} leaves "ใบเสร_จ" — Thai vowels and tones are combining marks.
    const built = storage.keyFor('org-1', 'task', 'task-1', 'ใบเสร็จ 2026.pdf')

    expect(built.endsWith('ใบเสร็จ_2026.pdf')).toBe(true)
  })

  it('cannot be walked out of its prefix', () => {
    const built = storage.keyFor('org-1', 'task', 'task-1', '../../etc/passwd')

    // Separators go; the dots may stay, since they climb nothing on their own.
    expect(built.startsWith('org-1/task/task-1/')).toBe(true)
    expect(built.split('/')).toHaveLength(4)
  })

  it('trims a very long name from the front, keeping the extension', () => {
    const built = storage.keyFor(
      'org-1',
      'task',
      'task-1',
      `${'ก'.repeat(400)}.pdf`,
    )

    expect(built.endsWith('.pdf')).toBe(true)
    expect([...built.split('-').at(-1)!]).toHaveLength(120)
  })
})
