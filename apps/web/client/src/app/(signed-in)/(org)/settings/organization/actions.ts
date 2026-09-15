'use server'

import { revalidatePath } from 'next/cache'

import {
  addOrgMemberSchema,
  changeMemberRoleSchema,
  idSchema,
  ORGANIZATION_ERROR_CODES,
  updateOrganizationSchema,
  type OrganizationRow,
  type OrgMemberRow,
  type OrgRole,
} from '@repo/shared'

import { toApiError } from '@/lib/api/errors'
import { apiForAction } from '@/lib/api/server'
import {
  failureOf,
  fieldErrorsOf,
  type FormState,
} from '@/lib/forms/form-state'
import type { MemberOutcome } from '@/lib/org/member-outcome'

export type OrgField = 'name'

/**
 * Renames the organisation.
 *
 * 🔒 **Owner only, and the API is what says so** — `ability.ts` gives an admin
 * `manage all` and then takes back exactly two things, of which `update
 * Organization` is one. The screen hides the form from an admin as a courtesy;
 * this would be refused anyway.
 *
 * The slug is not here even though `PATCH /v1/org` accepts it. Nothing routes
 * by it — the active organisation comes from a cookie — so changing it today
 * alters a string nobody reads, and offering it would be a control whose only
 * effect is a chance to break a link later, when something does route by it.
 */
export async function renameOrganization(
  formData: FormData,
): Promise<FormState<OrgField>> {
  const parsed = updateOrganizationSchema.safeParse({
    name: String(formData.get('name') ?? ''),
  })

  if (!parsed.success) {
    return {
      error: null,
      fieldErrors: fieldErrorsOf(parsed.error.issues, ['name']),
    }
  }

  try {
    const api = await apiForAction()

    await api.patch<OrganizationRow>('/org', parsed.data)

    // The layout, not this page: the name is in the organisation switcher at
    // the top of every screen, so a rename that only refreshed this one would
    // leave the old name in the sidebar until the next full load.
    revalidatePath('/', 'layout')

    return { error: null, fieldErrors: {} }
  } catch (error) {
    // No field to blame: a name is not unique and the only clash this endpoint
    // knows about is the slug, which this form does not send. Anything that
    // comes back is about the request rather than about the box.
    return failureOf(error)
  }
}

export type NewMemberField =
  'email' | 'username' | 'name' | 'nickname' | 'password' | 'role'

const NEW_MEMBER_FIELDS: NewMemberField[] = [
  'email',
  'username',
  'name',
  'nickname',
  'password',
  'role',
]

/**
 * Adds somebody to the organisation, account and all.
 *
 * Phase 1's way of onboarding: `organization.invitations` is migrated and
 * unread until Phase 2, so an owner or an admin types the details and the
 * account and the membership are created in one transaction. An address that
 * already has an account is **joined to this organisation** rather than given
 * a second one — one person, several organisations, from Phase 1.
 *
 * The password is set here and not emailed. That is not a shortcut: the reset
 * flow already exists and is the safer way to hand one over, and inventing a
 * second delivery mechanism now is exactly what Phase 2 is for.
 */
export async function addOrgMember(
  formData: FormData,
): Promise<FormState<NewMemberField>> {
  const parsed = addOrgMemberSchema.safeParse({
    email: String(formData.get('email') ?? ''),
    username: String(formData.get('username') ?? ''),
    name: String(formData.get('name') ?? ''),
    nickname: String(formData.get('nickname') ?? ''),
    password: String(formData.get('password') ?? ''),
    role: String(formData.get('role') ?? 'member'),
  })

  if (!parsed.success) {
    return {
      error: null,
      fieldErrors: fieldErrorsOf(parsed.error.issues, NEW_MEMBER_FIELDS),
    }
  }

  try {
    const api = await apiForAction()

    await api.post('/org/members', parsed.data)

    revalidatePath('/settings/organization')

    return { error: null, fieldErrors: {} }
  } catch (error) {
    // `ACCOUNT_EXISTS` means the address is already in *this* organisation —
    // an address with an account elsewhere is joined rather than refused — so
    // the email box is the right place for it. A username clash arrives from
    // `iam` without a code of its own and stays above the form, which is the
    // honest place for "the server said no" when nobody can say which box.
    return failureOf(error, {
      [ORGANIZATION_ERROR_CODES.ACCOUNT_EXISTS]: 'email',
    })
  }
}

/**
 * Promotes or demotes somebody.
 *
 * 🔒 The refusals that matter are the API's, not this screen's: the last owner
 * cannot be demoted — the condition is in the `UPDATE`, so two admins racing
 * cannot leave an organisation with none — and an admin may neither appoint an
 * owner nor demote one. The list below grey-outs what it can, and this reports
 * what it could not know.
 */
export async function changeMemberRole(
  userId: string,
  role: OrgRole,
): Promise<MemberOutcome> {
  const parsed = changeMemberRoleSchema.safeParse({ role })

  if (
    !parsed.success ||
    !idSchema('Invalid user id').safeParse(userId).success
  ) {
    return { ok: false, message: 'That role does not exist.' }
  }

  try {
    const api = await apiForAction()

    await api.patch(`/org/members/${userId}`, parsed.data)
    revalidatePath('/settings/organization')

    return { ok: true }
  } catch (error) {
    return { ok: false, message: toApiError(error).message }
  }
}

/**
 * Switches a colleague's account off, or back on.
 *
 * Their work does not move. Deactivating is a decision about an account, and
 * reassigning what somebody is holding is a decision about the work — the
 * specification is explicit that the second is not a side effect of the first,
 * which is why the list warns that the tasks are still theirs.
 *
 * Two refusals come back from the API and are worth reading rather than
 * guessing at: an account shared with another organisation cannot be switched
 * off here at all, and neither can the last owner.
 */
export async function setMemberActive(
  userId: string,
  active: boolean,
): Promise<MemberOutcome> {
  if (!idSchema('Invalid user id').safeParse(userId).success) {
    return { ok: false, message: 'No such member.' }
  }

  try {
    const api = await apiForAction()
    const path = `/org/members/${userId}/deactivate`

    if (active) await api.delete(path)
    else await api.post(path)

    revalidatePath('/settings/organization')

    return { ok: true }
  } catch (error) {
    return { ok: false, message: toApiError(error).message }
  }
}

/** Re-exported for the members list, which is handed rows by the page. */
export type { OrgMemberRow }
