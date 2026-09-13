import { redirect } from 'next/navigation'

import { currentUser } from '../../lib/api/me'

/**
 * Everything behind a session.
 *
 * A route group, so the URLs are unchanged — `/home` stays `/home` — and
 * `/login` stays outside it, which is the point: the sign-in screen must not
 * render a shell built from a session it does not have.
 *
 * It checks the session and nothing else. **The frame is chosen one level
 * down**, by `(home)` and `(org)`, because there are two of them and they are
 * not variants of one: Home is a screen about the person and lists every
 * organisation, while everything else is a screen about one organisation and
 * is scoped by the switcher. One shell trying to be both would have to draw an
 * org switcher above a page the switcher does not affect.
 */
export default async function SignedInLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if ((await currentUser()) === null) redirect('/login')

  return children
}
