'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'

import {
  api,
  refreshSession,
  setSessionLostHandler,
} from '../../lib/api/browser'
import { toApiError } from '../../lib/api/errors'
import {
  dropAccessTokenAction,
  loginAction,
  logoutAction,
  meAction,
  meParallelAction,
  type ActionOutcome,
} from './actions'

/**
 * The browser half. Same endpoints, same cookies, different transport.
 *
 * It is not the only party that can refresh — `proxy.ts` and `apiForAction`
 * can too, now that the refresh cookie is scoped to `/` — but it is the only
 * one that handles an expiry discovered *mid-session*, by an XHR that never
 * passes through the proxy.
 */

interface LogLine {
  at: string
  label: string
  ok: boolean
  status: number
  code?: string
  elapsedMs: number
  body: string
}

const DEMO_LOGIN = 'owner@taskflow.local'
const DEMO_PASSWORD = 'demo-password-not-for-production'

export function HarnessClient() {
  const router = useRouter()
  const [lines, setLines] = useState<LogLine[]>([])
  const [login, setLogin] = useState(DEMO_LOGIN)
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [pending, startTransition] = useTransition()

  const append = useCallback((line: LogLine) => {
    setLines((previous) => [line, ...previous].slice(0, 40))
  }, [])

  // Otherwise a failed refresh navigates to /login, which does not exist yet —
  // and the navigation would take the log with it, which is the one thing this
  // page is for.
  useEffect(() => {
    setSessionLostHandler(() => {
      append({
        at: now(),
        label: 'browser · session lost',
        ok: false,
        status: 401,
        elapsedMs: 0,
        body: 'refresh ไม่ผ่าน — ของจริงตรงนี้จะ window.location.assign("/login")',
      })
    })
  }, [append])

  function record(outcome: ActionOutcome) {
    append({
      at: now(),
      label: outcome.label,
      ok: outcome.ok,
      status: outcome.status,
      code: outcome.code,
      elapsedMs: outcome.elapsedMs,
      body:
        typeof outcome.body === 'string'
          ? outcome.body
          : JSON.stringify(outcome.body),
    })
  }

  async function fromBrowser(label: string, work: () => Promise<unknown>) {
    const started = performance.now()

    try {
      const body = await work()

      append({
        at: now(),
        label,
        ok: true,
        status: 200,
        elapsedMs: performance.now() - started,
        body: JSON.stringify(body),
      })
    } catch (error) {
      const failure = toApiError(error)

      append({
        at: now(),
        label,
        ok: false,
        status: failure.status,
        code: failure.code,
        elapsedMs: performance.now() - started,
        body: failure.message,
      })
    }
  }

  function runAction(work: () => Promise<ActionOutcome>) {
    startTransition(async () => {
      record(await work())
      // The Server Component panels above read cookies, so they are stale the
      // moment an action changes one.
      router.refresh()
    })
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-lg border border-black/10 p-4">
        <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase opacity-60">
          Credentials
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="login"
            className="rounded border border-black/20 px-2 py-1 text-sm"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
          />
          <input
            aria-label="password"
            className="rounded border border-black/20 px-2 py-1 text-sm"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      </div>

      <Group title="Browser · axios + interceptor">
        <Button
          onClick={() =>
            void fromBrowser(
              'browser · login',
              async () =>
                (await api.post('/auth/login', { login, password })).data,
            )
          }
        >
          login
        </Button>
        <Button
          onClick={() =>
            void fromBrowser(
              'browser · GET /me',
              async () => (await api.get('/me')).data,
            )
          }
        >
          GET /me
        </Button>
        <Button
          onClick={() =>
            void fromBrowser('browser · GET /me ×6 พร้อมกัน', async () => {
              const replies = await Promise.all(
                Array.from({ length: 6 }, () => api.get('/me')),
              )

              return { requests: replies.length, refreshes: 'ดู Network tab' }
            })
          }
        >
          GET /me ×6 (single-flight)
        </Button>
        <Button
          onClick={() =>
            void fromBrowser('browser · refresh ตรงๆ', async () => {
              await refreshSession()

              return { refreshed: true }
            })
          }
        >
          refresh
        </Button>
        <Button
          onClick={() =>
            void fromBrowser(
              'browser · logout',
              async () => (await api.post('/auth/logout')).status,
            )
          }
        >
          logout
        </Button>
      </Group>

      <Group title="Server Action · apiForAction">
        <Button
          disabled={pending}
          onClick={() => runAction(() => loginAction(login, password))}
        >
          login
        </Button>
        <Button disabled={pending} onClick={() => runAction(meAction)}>
          GET /me
        </Button>
        <Button
          disabled={pending}
          onClick={() => runAction(() => meParallelAction(false))}
        >
          GET /me ×6 (Promise.all)
        </Button>
        <Button
          disabled={pending}
          onClick={() => runAction(() => meParallelAction(true))}
        >
          GET /me ×6 หลังทิ้ง token
        </Button>
        <Button disabled={pending} onClick={() => runAction(logoutAction)}>
          logout
        </Button>
        <Button
          disabled={pending}
          onClick={() => runAction(dropAccessTokenAction)}
        >
          ทิ้ง access_token
        </Button>
      </Group>

      <div className="rounded-lg border border-black/10 p-4">
        <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase opacity-60">
          Log
        </h2>
        <div className="flex flex-col gap-1 font-[family-name:var(--font-ibm-plex-mono)] text-xs">
          {lines.length === 0 ? (
            <span className="opacity-50">ยังไม่มีอะไรเกิดขึ้น</span>
          ) : (
            lines.map((line, index) => (
              <div
                key={`${line.at}-${index}`}
                className={line.ok ? 'text-green-700' : 'text-red-700'}
              >
                <span className="opacity-60">{line.at}</span>{' '}
                <strong>{line.label}</strong>{' '}
                <span>
                  {line.status}
                  {line.code === undefined ? '' : ` ${line.code}`}
                </span>{' '}
                <span className="opacity-60">
                  {line.elapsedMs.toFixed(0)}ms
                </span>{' '}
                <span className="break-all opacity-80">{line.body}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function Group({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-black/10 p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase opacity-60">
        {title}
      </h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function Button({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-black/20 px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function now(): string {
  return new Date().toISOString().slice(11, 23)
}
