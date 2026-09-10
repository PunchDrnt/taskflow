'use server'

import { revalidatePath } from 'next/cache'

import {
  assignTaskSchema,
  createTaskSchema,
  idSchema,
  TASK_ERROR_CODES,
  type AssigneeRow,
  type Page,
  type TaskRow,
} from '@repo/shared'

import { fetchAssignable } from '../../../../lib/api/assignable'
import { ApiError, toApiError } from '../../../../lib/api/errors'
import { apiForAction } from '../../../../lib/api/server'
import type {
  AssignOutcome,
  PeopleFound,
  QuickAddOutcome,
} from '../../../../lib/tasks/task-actions-result'

/**
 * Quick add — a title and Enter, and nothing else.
 *
 * 🟡 docs/03-roadmap.md marks this amber and says it cannot be cut: it is the
 * thing that makes people come back. Everything the API could have demanded is
 * therefore optional — the status comes from the project's `is_default` and
 * the position from the end of that column — so requiring anything here would
 * cost the feature the only thing it is for.
 *
 * The list is revalidated rather than patched into place, because the server
 * decides both of those and guessing them on this side would put the row in
 * the wrong column until the next load.
 */
export async function quickAddTask(
  projectId: string,
  title: string,
): Promise<QuickAddOutcome> {
  if (!idSchema('Invalid project id').safeParse(projectId).success) {
    return { ok: false, message: 'That project does not exist.' }
  }

  const parsed = createTaskSchema.safeParse({ title })

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Enter a task title',
    }
  }

  try {
    const api = await apiForAction()
    const { data } = await api.post<TaskRow>(
      `/projects/${projectId}/tasks`,
      parsed.data,
    )

    revalidatePath(`/projects/${projectId}`)

    return { ok: true, task: data }
  } catch (error) {
    return { ok: false, message: toApiError(error).message }
  }
}

/**
 * Type-ahead for the assignee picker.
 *
 * A Server Action rather than a browser fetch, for the reason every read on
 * this side goes through one: the session lives in an httpOnly cookie the
 * browser cannot read, and `apiForAction` is the surface that can renew it.
 */
export async function searchAssignable(
  projectId: string,
  q: string,
  scope: 'project' | 'org',
): Promise<PeopleFound> {
  if (!idSchema('Invalid project id').safeParse(projectId).success) {
    return { ok: false, message: 'That project does not exist.' }
  }

  try {
    const api = await apiForAction()

    return {
      ok: true,
      people: await fetchAssignable(api, projectId, { q, scope }),
    }
  } catch (error) {
    return { ok: false, message: toApiError(error).message }
  }
}

/**
 * Gives the task to somebody, and reports the one refusal worth asking about.
 *
 * 🔒 `NOT_PROJECT_MEMBER` is answered as a *question*, not retried. Adding
 * somebody to a project hands them everything in it — every task, comment and
 * attachment — and that is not a side effect of picking a name out of a list.
 * The confirmation is a second request carrying `addToProject: true`, which is
 * what makes the widening of access a thing somebody chose.
 */
export async function assignTask(
  taskId: string,
  userId: string,
  addToProject = false,
): Promise<AssignOutcome> {
  const parsed = assignTaskSchema.safeParse({ userId, addToProject })

  if (
    !parsed.success ||
    !idSchema('Invalid task id').safeParse(taskId).success
  ) {
    return { ok: false, kind: 'failed', message: 'Could not assign that task.' }
  }

  try {
    const api = await apiForAction()
    const { data } = await api.post<Page<AssigneeRow>>(
      `/tasks/${taskId}/assignees`,
      parsed.data,
    )

    return { ok: true, assignees: data.data }
  } catch (error) {
    const failure = toApiError(error)

    if (failure.code === TASK_ERROR_CODES.NOT_PROJECT_MEMBER) {
      return {
        ok: false,
        kind: 'needs-project-membership',
        message: failure.message,
      }
    }

    return { ok: false, kind: 'failed', message: failure.message }
  }
}

/** Takes the task off them. They stay in the project — see the API. */
export async function unassignTask(
  taskId: string,
  userId: string,
): Promise<AssignOutcome> {
  if (
    !idSchema('Invalid task id').safeParse(taskId).success ||
    !idSchema('Invalid user id').safeParse(userId).success
  ) {
    return { ok: false, kind: 'failed', message: 'Could not change that task.' }
  }

  try {
    const api = await apiForAction()

    await api.delete(`/tasks/${taskId}/assignees/${userId}`)

    // Re-read rather than filtering the row on this side. It is one more round
    // trip for the guarantee that what is drawn is what the server holds —
    // and the delete is the request that could have raced with somebody else's.
    const { data } = await api.get<Page<AssigneeRow>>(
      `/tasks/${taskId}/assignees`,
    )

    return { ok: true, assignees: data.data }
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, kind: 'failed', message: error.message }
    }

    throw error
  }
}
