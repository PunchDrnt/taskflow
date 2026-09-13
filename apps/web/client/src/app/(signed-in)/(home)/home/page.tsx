import { PageBody } from '../../../../components/atoms/page-body'
import { HomeWork } from '../../../../components/organisms/home-work'
import { NoOrganisation } from '../../../../components/organisms/no-organisation'
import { currentUser } from '../../../../lib/api/me'
import { dueWork } from '../../../../lib/api/my-work'
import { greeting, todayLabel } from '../../../../lib/format/greeting'

/**
 * Home — where signing in lands, and the only screen about the person rather
 * than about one organisation.
 *
 * At `/home` and not at `/`. Every other screen has a name, so leaving this
 * one unnamed would make `pathname === '/'` a special case in navigation
 * forever; and `/` has a job of its own — deciding, without rendering
 * anything, whether somebody belongs on this page or on the sign-in screen.
 * One path doing both is what makes "where does signing in land" ambiguous.
 *
 * The organisations themselves are in the sidebar beside this, not on it —
 * see `HomeShell`. They are navigation, and a list of them in the page body as
 * well would be the same links twice.
 *
 * It crosses organisations on purpose. `GET /v1/me/tasks` is the endpoint that
 * exists for it, and docs/04-features/phase-1.md#organization is explicit that
 * a home screen scoped to whichever org a cookie happens to name would hide
 * half of somebody's week. That is also why the sidebar's switcher does not
 * change what is on this page — see `AppShell`.
 *
 * The session check belongs to `layout.tsx`, which every screen in this group
 * shares. What is left here is the one branch only Home has: an account that
 * works but is in no company yet.
 */
export default async function HomePage() {
  const me = await currentUser()

  // Non-null: the layout redirected anybody without a session before this ran.
  if (me === null) return null

  if (me.organizations.length === 0) {
    return <NoOrganisation name={me.nickname} email={me.email} />
  }

  const { rows, capped } = await dueWork()

  return (
    <PageBody width="reading" className="gap-8">
      <header className="flex flex-col gap-2">
        <span className="overlined text-text-disabled tracking-wide">
          {todayLabel()}
        </span>
        <h1 className="h4 font-extrabold">
          {greeting()}, {me.nickname}
        </h1>
        <p className="text-text-secondary body-1">
          Everything on your plate, across every organisation you are in.
        </p>
      </header>

      <HomeWork rows={rows} capped={capped} />
    </PageBody>
  )
}
