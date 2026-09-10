'use server'

import { revalidatePath } from 'next/cache'

import {
  createProjectSchema,
  PROJECT_ERROR_CODES,
  type ProjectRow,
} from '@repo/shared'

import { apiForAction } from '../../../lib/api/server'
import {
  failureOf,
  fieldErrorsOf,
  type FormState,
} from '../../../lib/forms/form-state'

export type NewProjectField = 'name' | 'keyPrefix' | 'color' | 'description'

/**
 * Creates a project, or says what is wrong with the form.
 *
 * Validated here with `createProjectSchema` — the API's own schema, not a
 * second description of the same rules. `keyPrefix` in particular carries a
 * `.toUpperCase()` and a regex that matches the `projects_key_prefix_check`
 * CHECK exactly, and a client that re-stated either would eventually let
 * through a value the database refuses, which arrives as a 500.
 *
 * `NAME_TAKEN` is blamed on the name box. The API's sentence is accurate but
 * lands above a form with four fields, and "which one" is the only thing the
 * person needs at that moment.
 *
 * No redirect: the dialog closes itself when the state comes back clean, and
 * the revalidated list is already behind it.
 */
export async function createProject(
  _previous: FormState<NewProjectField>,
  formData: FormData,
): Promise<FormState<NewProjectField>> {
  const parsed = createProjectSchema.safeParse({
    name: formData.get('name'),
    keyPrefix: formData.get('keyPrefix'),
    color: formData.get('color'),
    description: emptyToUndefined(formData.get('description')),
  })

  if (!parsed.success) {
    return {
      error: null,
      fieldErrors: fieldErrorsOf(parsed.error.issues, [
        'name',
        'keyPrefix',
        'color',
        'description',
      ]),
    }
  }

  try {
    const api = await apiForAction()
    await api.post<ProjectRow>('/projects', parsed.data)
  } catch (error) {
    return failureOf<NewProjectField>(error, {
      [PROJECT_ERROR_CODES.NAME_TAKEN]: 'name',
    })
  }

  revalidatePath('/projects')

  return { error: null, fieldErrors: {} }
}

/**
 * An untouched textarea sends `''`, which `projectDescriptionSchema` accepts
 * as a real empty description rather than as an absent one. Undefined is what
 * "left blank" means, and it is the difference between a `null` column and an
 * empty string nobody typed.
 */
function emptyToUndefined(
  value: FormDataEntryValue | null,
): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''

  return text === '' ? undefined : text
}
