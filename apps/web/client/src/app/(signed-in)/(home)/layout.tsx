import { HomeShell } from '@/components/organisms/home-shell'
import { currentUser } from '@/lib/api/me'

/**
 * The frame around Home: every organisation listed, and no switcher.
 *
 * Somebody in no organisation gets no shell at all. A sidebar whose only
 * section is an empty list of organisations, beside a page that exists to say
 * there are none, is two answers to one question — so the page is left to give
 * it on its own.
 */
export default async function HomeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const me = await currentUser()

  // Non-null: the layout above redirected anybody without a session.
  if (me === null || me.organizations.length === 0) return children

  return <HomeShell me={me}>{children}</HomeShell>
}
