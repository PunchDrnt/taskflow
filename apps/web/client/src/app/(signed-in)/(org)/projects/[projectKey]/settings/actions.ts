'use server'

import { revalidatePath } from 'next/cache'

import {
  PROJECT_ERROR_CODES,
  updateProjectSchema,
  type ProjectRow,
} from '@repo/shared'

import { projectByKey } from '@/lib/api/projects'
import { apiForAction } from '@/lib/api/server'
import {
  failureOf,
  fieldErrorsOf,
  type FormState,
} from '@/lib/forms/form-state'

export type ProjectField = 'name' | 'color' | 'description'

const FIELDS: ProjectField[] = ['name', 'color', 'description']

/**
 * Renames a project, or changes its colour or description.
 *
 * **The key prefix is not among them**, and the form shows it as text for the
 * same reason `updateProjectSchema` refuses it: it is the project's URL and
 * the front half of every task key, so a rename would 404 every link already
 * handed out — and open a different project the day another one takes the
 * freed prefix.
 *
 * It takes the URL's segment rather than the project's id because that is what
 * the screen has, and the id is one lookup away. The prefix cannot move, so
 * neither can the address bar.
 *
 * The description is sent as `null` when cleared rather than left out, which
 * `updateProjectSchema` distinguishes on purpose: absent means "leave it
 * alone" and null means "there is no description now".
 *
 * `NAME_TAKEN` is blamed on the name box: the API's sentence is accurate but
 * lands above a form with three of them, and "which one" is the only thing the
 * person needs at that moment.
 */
export async function updateProject(
  projectKey: string,
  formData: FormData,
): Promise<FormState<ProjectField>> {
  const parsed = updateProjectSchema.safeParse({
    name: formData.get('name'),
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
    // The id the API works in, from the prefix the URL is written in.
    const project = await projectByKey(api, projectKey)

    if (project === null) {
      return { error: 'That project no longer exists.', fieldErrors: {} }
    }

    await api.patch<ProjectRow>(`/projects/${project.id}`, parsed.data)
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
