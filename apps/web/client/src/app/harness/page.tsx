import { cookies } from 'next/headers'

import {
  ACCESS_TOKEN_COOKIE,
  ACTIVE_ORG_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '@repo/shared'

import { expiryOf } from '../../lib/api/access-token'
import { toApiError } from '../../lib/api/errors'
import { apiForRender } from '../../lib/api/server'
import { HarnessClient } from './harness-client'

/**
 * A harness, not a screen. It exists to make each of the four places a request
 * can start from observable side by side, and it is meant to be deleted the
 * day real screens replace it.
 *
 * Never statically rendered: every panel below is a function of the request's
 * cookies.
 */
export const dynamic = 'force-dynamic'

interface Probe {
  label: string
  detail: string
  ok: boolean
}

export default async function HarnessPage() {
  const jar = await cookies()

  const present = jar.getAll().map((cookie) => cookie.name)
  const accessToken = jar.get(ACCESS_TOKEN_COOKIE)?.value
  const expiresAt = accessToken === undefined ? null : expiryOf(accessToken)

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <header>
        <h1 className="font-[family-name:var(--font-chakra-petch)] text-2xl font-bold">
          Auth transport harness
        </h1>
        <p className="text-sm opacity-70">
          ยิงเส้นเดียวกันจากสี่ที่ แล้วดูว่าใครหมุน token ได้บ้าง
        </p>
      </header>

      <Panel title="Server Component · what this request is holding">
        <Row label="cookies ที่ browser ส่งมากับหน้านี้">
          {present.length === 0 ? '(ไม่มี)' : present.join(', ')}
        </Row>
        <Row label={`${REFRESH_TOKEN_COOKIE} ถึง server หรือเปล่า`}>
          {present.includes(REFRESH_TOKEN_COOKIE)
            ? 'ถึง'
            : 'ไม่ถึง — path=/api/v1/auth กันไว้ ฉะนั้น proxy กับ server action ไม่มี token จะ refresh'}
        </Row>
        <Row label={`${ACCESS_TOKEN_COOKIE} exp`}>
          {describeExpiry(expiresAt)}
        </Row>
        <Row label={ACTIVE_ORG_COOKIE}>
          {jar.get(ACTIVE_ORG_COOKIE)?.value ?? '(ไม่มี)'}
        </Row>
      </Panel>

      <Panel title="Server Component · GET /v1/me ระหว่าง render">
        <RenderedMe />
      </Panel>

      <Panel title="Server Component · ลองเขียน cookie ระหว่าง render">
        <CookieWriteProbe />
      </Panel>

      <HarnessClient />
    </main>
  )
}

/**
 * The read a real page would do. `apiForRender` is deliberately incapable of
 * refreshing, so whatever comes back here is the honest state of the session
 * as of the moment `proxy.ts` finished with it.
 */
async function RenderedMe() {
  const result = await readMe()

  return <Pre ok={result.ok}>{result.text}</Pre>
}

/**
 * The fetch and the render are separate on purpose, and not only because
 * `react-hooks/error-boundaries` says so: JSX returned from inside a `try` is
 * not rendered inside it, so a throw during render escapes the `catch` that
 * looks like it covers it.
 */
async function readMe(): Promise<{ ok: boolean; text: string }> {
  try {
    const api = await apiForRender()

    return {
      ok: true,
      text: JSON.stringify((await api.get('/me')).data, null, 2),
    }
  } catch (error) {
    const failure = toApiError(error)

    return {
      ok: false,
      text: `${failure.status} ${failure.code}\n${failure.message}`,
    }
  }
}

/**
 * The constraint this whole design is built around, measured rather than
 * asserted: `cookies().set()` inside a render.
 *
 * If this panel ever reports success, the reasoning in `lib/api/server.ts`
 * needs revisiting — and until it does, the message Next throws is a better
 * explanation of why a render cannot refresh than any comment.
 */
async function CookieWriteProbe() {
  const probe = await probeCookieWrite()

  return (
    <Pre ok={!probe.ok}>
      {probe.ok
        ? `⚠️ เขียนสำเร็จ — ${probe.detail}`
        : `เขียนไม่ได้ ตามคาด:\n${probe.detail}`}
    </Pre>
  )
}

async function probeCookieWrite(): Promise<Probe> {
  const jar = await cookies()

  try {
    jar.set('harness_render_write', 'nope')

    return { label: 'render write', ok: true, detail: 'cookie ถูกตั้งจริง' }
  } catch (error) {
    return {
      label: 'render write',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

function describeExpiry(expiresAt: number | null): string {
  if (expiresAt === null) return '(ไม่มี access token หรืออ่านไม่ออก)'

  const seconds = Math.round((expiresAt - Date.now()) / 1000)

  return seconds > 0
    ? `อีก ${seconds} วินาที (${new Date(expiresAt).toISOString()})`
    : `หมดอายุไปแล้ว ${-seconds} วินาที`
}

function Panel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-black/10 p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase opacity-60">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[minmax(0,18rem)_1fr] gap-3 text-sm">
      <span className="opacity-60">{label}</span>
      <span className="font-[family-name:var(--font-ibm-plex-mono)] break-all">
        {children}
      </span>
    </div>
  )
}

function Pre({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <pre
      className={`overflow-x-auto rounded border p-3 font-[family-name:var(--font-ibm-plex-mono)] text-xs ${
        ok
          ? 'border-green-600/30 bg-green-600/5'
          : 'border-red-600/30 bg-red-600/5'
      }`}
    >
      {children}
    </pre>
  )
}
