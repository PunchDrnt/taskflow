'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { setActiveOrgSchema } from '@repo/shared'

import { toApiError } from '@/lib/api/errors'
import { mirrorCookies } from '@/lib/api/mirror-cookies'
import { apiForAction } from '@/lib/api/server'

/**
 * Changes which organisation this session acts for.
 *
 * The cookie is a **choice, never a permission**: the API re-checks it against
 * the caller's memberships on every request, so what this really does is ask
 * the API to agree — a 403 comes back if they are not a member, and nothing is
 * written.
 *
 * No new token is issued, which is the point of keeping `org` out of the access
 * token: switching companies is one small request, not a re-authentication.
 *
 * ⚠️ `revalidatePath('/', 'layout')` and not a client-side navigation. Every
 * server-rendered page above this one read the *old* organisation, so anything
 * cached from before the switch has to go — including the shell that draws the
 * switcher itself.
 */
export async function switchOrganisation(
  orgId: string,
): Promise<{ error: string | null }> {
  const parsed = setActiveOrgSchema.safeParse({ orgId })

  if (!parsed.success) return { error: 'That is not an organisation.' }

  try {
    const api = await apiForAction()
    const response = await api.post('/me/active-org', parsed.data)

    await mirrorCookies(response.headers['set-cookie'])
  } catch (error) {
    return { error: toApiError(error).message }
  }

  revalidatePath('/', 'layout')

  return { error: null }
}

/**
 * Ends this session and returns to the sign-in screen.
 *
 * The redirect happens **whatever the API said**, and that is the decision
 * worth stating: a logout that failed still has to leave the person signed
 * out. The one failure mode that matters is a token already dead — answering
 * it with "could not sign out" would strand somebody on a screen whose only
 * exit is the one that just refused.
 *
 * The clearing cookies come from the API's own response, so the browser stops
 * presenting a token the server has already revoked; if that response never
 * arrived there is nothing to mirror and the next request 401s instead.
 *
 * `redirect` is outside the `try` because it works by throwing — inside, it
 * would be caught as the logout having failed.
 */
export async function signOut(): Promise<void> {
  try {
    const api = await apiForAction()
    const response = await api.post('/auth/logout')

    await mirrorCookies(response.headers['set-cookie'])
  } catch {
    // Nothing to report to: the screen this was pressed on is about to be
    // replaced by the sign-in form either way.
  }

  redirect('/login')
}
