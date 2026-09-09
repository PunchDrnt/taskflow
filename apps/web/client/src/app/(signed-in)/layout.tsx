import { redirect } from 'next/navigation'

import { AppShell } from '../../components/organisms/app-shell'
import { currentUser } from '../../lib/api/me'

/**
 * Everything behind a session.
 *
 * A route group, so the URLs are unchanged — `/` stays `/` — and `/login`
 * stays outside it, which is the point: the sign-in screen must not render a
 * sidebar built from a session it does not have.
 *
 * Somebody in no organisation gets no shell. A sidebar whose first control is
 * an organisation switcher with nothing in it, above navigation that all leads
 * to `NO_ORGANIZATION`, is a worse answer than the page that explains the
 * situation — so the frame starts when there is something to frame.
 */
export default async function SignedInLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const me = await currentUser()

  if (me === null) redirect('/login')

  if (me.organizations.length === 0) return children

  return <AppShell me={me}>{children}</AppShell>
}
