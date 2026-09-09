import { redirect } from 'next/navigation'

import { currentUser } from '../lib/api/me'

/**
 * The front door. It renders nothing and decides one thing.
 *
 * Home used to live here, which gave `/` two jobs: being a screen, and being
 * the answer to "where does somebody who just arrived belong". Splitting them
 * is what lets every screen have a name — `pathname === '/'` is no longer a
 * special case in the sidebar — and leaves one obvious place for the entry
 * rule to live when a marketing page or an interstitial eventually wants it.
 *
 * Deliberately outside the `(signed-in)` group: it must answer for a caller
 * with no session too, and it has no shell to draw either way.
 */
export default async function RootPage() {
  redirect((await currentUser()) === null ? '/login' : '/home')
}
