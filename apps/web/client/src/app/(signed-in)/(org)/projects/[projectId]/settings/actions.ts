'use server'

import { revalidatePath } from 'next/cache'

import {
  PROJECT_ERROR_CODES,
  updateProjectSchema,
  type ProjectRow,
} from '@repo/shared'

import { apiForAction } from '../../../../../../lib/api/server'
import {
  failureOf,
  fieldErrorsOf,
  type FormState,
} from '../../../../../../lib/forms/form-state'

export type ProjectField = 'name' | 'keyPrefix' | 'color' | 'description'

const FIELDS: ProjectField[] = ['name', 'keyPrefix', 'color', 'description']

/**
 * Renames, recolours or re-prefixes a project.
 *
 * ⚠️ **Changing the key prefix changes every key already in circulation.**
 * `tasks.number` is what is stored and the key is assembled from the prefix at
 * read time, so `OPS-14` in a two-month-old chat message becomes `OP-14`
 * everywhere at once. Numbers are never reissued, so nothing is ambiguous —
 * but the screen has to say so before somebody does it casually.
 *
 * The description is sent as `null` when cleared rather than left out, which
 * `updateProjectSchema` distinguishes on purpose: absent means "leave it
 * alone" and null means "there is no description now".
 *
 * `NAME_TAKEN` is blamed on the name for the reason the create dialog does it:
 * the API's sentence is accurate and lands above a form with four boxes.
 */
export async function updateProject(
  projectId: string,
  formData: FormData,
): Promise<FormState<ProjectField>> {
  const parsed = updateProjectSchema.safeParse({
    name: formData.get('name'),
    keyPrefix: formData.get('keyPrefix'),
    color: formData.get('color'),
    description: blankToNull(formData.get('description')),
  })

  if (!parsed.success) {
    return {
      error: null,
      fieldErrors: fieldErrorsOf(parsed.error.issues, FIELDS),
    }
  }

  try {
    const api = await apiForAction()
    await api.patch<ProjectRow>(`/projects/${projectId}`, parsed.data)
  } catch (error) {
    return failureOf<ProjectField>(error, {
      [PROJECT_ERROR_CODES.NAME_TAKEN]: 'name',
    })
  }

  // The name and colour are in the sidebar on every screen, not only here.
  revalidatePath('/', 'layout')

  return { error: null, fieldErrors: {} }
}

/** An emptied textarea sends `''`; null is what "no description" means. */
function blankToNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === 'string' ? value.trim() : ''

  return text === '' ? null : text
}
