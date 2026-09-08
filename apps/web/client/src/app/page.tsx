import { redirect } from 'next/navigation'

import { NoOrganisation } from '../components/organisms/no-organisation'
import { currentUser } from '../lib/api/me'

/**
 * Home — where signing in lands, and the only screen that is about the person
 * rather than about one organisation.
 *
 * The three states are decided here and nowhere else, which is why
 * `app/login/actions.ts` redirects to `/` instead of choosing a destination
 * itself: signed out, signed in with no organisation, and signed in with at
 * least one.
 */
export default async function HomePage() {
  const me = await currentUser()

  if (me === null) redirect('/login')

  if (me.organizations.length === 0) {
    return <NoOrganisation name={me.nickname} />
  }

  return (
    <main className="bg-subtle min-h-screen p-6">
      <h1 className="text-headline-sm font-bold">Hello, {me.nickname}</h1>
      <p className="text-text-secondary mt-1 text-sm">
        {me.organizations.length === 1
          ? me.organizations[0]?.name
          : `${String(me.organizations.length)} organisations`}
      </p>
    </main>
  )
}
