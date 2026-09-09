import { redirect } from 'next/navigation'

import { Stat } from '../components/molecules/stat'
import { DueWork } from '../components/organisms/due-work'
import { NoOrganisation } from '../components/organisms/no-organisation'
import { OrganisationList } from '../components/organisms/organisation-list'
import { currentUser } from '../lib/api/me'
import { dueWork } from '../lib/api/my-work'
import { dueBucket } from '../lib/format/due-date'

/**
 * Home — where signing in lands, and the only screen about the person rather
 * than about one organisation.
 *
 * The three states are decided here and nowhere else, which is why
 * `app/login/actions.ts` redirects to `/` instead of picking a destination
 * itself: signed out, signed in with no organisation, and signed in with at
 * least one.
 *
 * It crosses organisations on purpose — `GET /v1/me/tasks` is the endpoint
 * that exists for it, and docs/04-features/phase-1.md#organization is explicit
 * that a home screen scoped to whichever org a cookie names would hide half of
 * somebody's week.
 */
export default async function HomePage() {
  const me = await currentUser()

  if (me === null) redirect('/login')

  if (me.organizations.length === 0) {
    return <NoOrganisation name={me.nickname} />
  }

  const { rows, capped } = await dueWork()
  const now = new Date()
  const overdue = rows.filter(
    (row) => dueBucket(row.dueDate, now) === 'overdue',
  ).length
  const thisWeek = rows.filter((row) =>
    ['today', 'soon'].includes(dueBucket(row.dueDate, now)),
  ).length

  return (
    <main className="bg-subtle min-h-screen">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
        <header>
          <h1 className="text-headline-sm font-bold">Hello, {me.nickname}</h1>
          <p className="text-text-secondary mt-1 text-sm">
            Everything on your plate, across every organisation you are in.
          </p>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Open" value={rows.length} capped={capped} />
          <Stat label="Overdue" value={overdue} tone="urgent" />
          <Stat label="Due this week" value={thisWeek} />
        </div>

        <DueWork rows={rows} />

        <OrganisationList organizations={me.organizations} />
      </div>
    </main>
  )
}
