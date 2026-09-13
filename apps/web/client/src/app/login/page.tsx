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
 *
 * Two panels, and the left one carries the name and nothing else — it is a
 * ground for the form to sit against, not a place to explain the product to
 * people who already work here. Hidden below `lg`, where a phone has no room
 * for anything but the form.
 */
export default async function LoginPage() {
  if ((await currentUser()) !== null) redirect('/home')

  return (
    <main className="bg-default grid min-h-screen lg:grid-cols-2">
      {/* The name on a plain ground, and nothing else. This is an internal
          tool behind a door everybody using it already has a key to — neither
          a panel selling it to a first-time visitor nor the prototype's two
          decorative circles, which at this size read as shapes somebody
          forgot to remove rather than as a wash. */}
      <aside className="bg-paper-elevation-1 border-divider hidden items-start border-r p-10 lg:flex">
        <span className="h4 text-primary-main font-bold">Taskflow</span>
      </aside>

      <div className="flex items-center justify-center p-6">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex flex-col gap-1">
            <span className="subtitle-2 text-primary-main font-bold lg:hidden">
              Taskflow
            </span>
            <h2 className="h5">Log in</h2>
          </div>

          <LoginForm />
        </div>
      </div>
    </main>
  )
}
