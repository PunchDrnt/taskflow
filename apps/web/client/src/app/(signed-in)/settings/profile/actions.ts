'use server'

import { revalidatePath } from 'next/cache'

import { avatarUploadSchema, updateProfileSchema, type Me } from '@repo/shared'

import { toApiError } from '../../../../lib/api/errors'
import { apiForAction } from '../../../../lib/api/server'
import {
  failureOf,
  fieldErrorsOf,
  type FormState,
} from '../../../../lib/forms/form-state'
import type { UploadTarget } from '../../../../lib/image/upload-target'

export type ProfileField =
  'username' | 'name' | 'nickname' | 'phone' | 'avatarUrl'

const FIELDS: ProfileField[] = [
  'username',
  'name',
  'nickname',
  'phone',
  'avatarUrl',
]

/**
 * Somewhere to put a new profile picture.
 *
 * The browser PUTs to the returned URL and then sends the **key** — not a URL
 * — back through `PATCH /v1/me`. The bucket is private, so there is no URL
 * that keeps working; `GET /v1/users/:id/avatar` is the one place a key turns
 * back into a picture.
 *
 * ⚠️ The signed URL carries no size or type condition, so whatever the browser
 * decides to PUT is what the bucket stores. `compressForAvatar` is the only
 * thing standing between a phone camera and a 12MB object — see its docblock.
 */
export async function avatarUploadTarget(
  fileName: string,
): Promise<UploadTarget> {
  const parsed = avatarUploadSchema.safeParse({ fileName })

  if (!parsed.success) {
    return { ok: false, message: 'That file name will not do.' }
  }

  try {
    const api = await apiForAction()
    const { data } = await api.post<{ uploadUrl: string; key: string }>(
      '/me/avatar-upload',
      parsed.data,
    )

    return { ok: true, ...data }
  } catch (error) {
    return { ok: false, message: toApiError(error).message }
  }
}

/**
 * Saves the profile.
 *
 * `PATCH /v1/me` takes the whole set rather than a patch — `updateProfileSchema`
 * requires every field, with null for the two that can be cleared — so the form
 * always sends all of them and clearing the phone is an ordinary submission
 * rather than a special request.
 *
 * ⏳ The email is deliberately absent. Changing it means proving the new
 * address first, and that flow is Phase 2; a field that silently did not save
 * would be worse than no field.
 */
export async function saveProfile(
  _previous: FormState<ProfileField>,
  formData: FormData,
): Promise<FormState<ProfileField>> {
  const parsed = updateProfileSchema.safeParse({
    username: formData.get('username'),
    name: formData.get('name'),
    nickname: formData.get('nickname'),
    phone: blankToNull(formData.get('phone')),
    avatarUrl: blankToNull(formData.get('avatarUrl')),
  })

  if (!parsed.success) {
    return {
      error: null,
      fieldErrors: fieldErrorsOf(parsed.error.issues, FIELDS),
    }
  }

  try {
    const api = await apiForAction()
    await api.patch<Me>('/me', parsed.data)
  } catch (error) {
    return failureOf<ProfileField>(error, { USERNAME_TAKEN: 'username' })
  }

  // The shell draws the nickname and the avatar, so every signed-in screen is
  // stale after this, not just this one.
  revalidatePath('/', 'layout')

  return { error: null, fieldErrors: {} }
}

/** An untouched box sends `''`; null is what "cleared" means to the schema. */
function blankToNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === 'string' ? value.trim() : ''

  return text === '' ? null : text
}
