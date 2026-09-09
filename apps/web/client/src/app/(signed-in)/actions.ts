'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

import { setActiveOrgSchema } from '@repo/shared'

import { toApiError } from '../../lib/api/errors'
import { apiForAction } from '../../lib/api/server'
import { parseSetCookie } from '../../lib/api/set-cookie'

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

    await mirror(response.headers['set-cookie'])
  } catch (error) {
    return { error: toApiError(error).message }
  }

  revalidatePath('/', 'layout')

  return { error: null }
}

/** Copies the API's `Set-Cookie` headers onto this action's response. */
async function mirror(raw: unknown): Promise<void> {
  if (!Array.isArray(raw)) return

  const jar = await cookies()

  for (const header of raw) {
    if (typeof header !== 'string') continue

    const cookie = parseSetCookie(header)
    if (cookie !== null) jar.set(cookie.name, cookie.value, cookie.options)
  }
}
