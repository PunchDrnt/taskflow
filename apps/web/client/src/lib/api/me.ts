import type { Me } from '@repo/shared'

import { isUnauthenticated } from './errors'
import { apiForRender } from './server'

/**
 * Who is signed in, or null.
 *
 * Null rather than a throw, because "signed out" is a state every page has to
 * render, not an error any of them can recover from. `apiForRender` cannot
 * refresh — by the time a 401 reaches here `proxy.ts` has already tried and
 * failed, so there is nothing left to attempt.
 *
 * `@SkipOrgScope()` on the API side is what makes this answerable before an
 * organisation is chosen, which is the whole reason the sign-in screen and the
 * organisation picker can both ask it.
 */
export async function currentUser(): Promise<Me | null> {
  try {
    const api = await apiForRender()

    return (await api.get<Me>('/me')).data
  } catch (error) {
    if (isUnauthenticated(error)) return null

    throw error
  }
}
