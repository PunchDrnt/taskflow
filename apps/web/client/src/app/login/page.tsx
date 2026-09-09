import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { LoginForm } from '../../components/organisms/login-form'
import { currentUser } from '../../lib/api/me'

export const metadata: Metadata = {
  title: 'Sign in · Taskflow',
}

/**
 * Signing in.
 *
 * Sends an already-signed-in caller to `/` rather than showing the form again:
 * the session is in a cookie, so arriving here with one usually means a
 * bookmark or a back button, not an intention to sign in twice.
 */
export default async function LoginPage() {
  if ((await currentUser()) !== null) redirect('/home')

  return (
    <main className="bg-subtle flex min-h-screen items-center justify-center p-6">
      <div className="bg-default border-default w-full max-w-sm rounded-xl border p-8 shadow-sm">
        <div className="mb-8 flex flex-col gap-1">
          <h1 className="text-headline-sm font-bold">Taskflow</h1>
          <p className="text-text-secondary text-sm">
            Sign in to pick up your work.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  )
}
