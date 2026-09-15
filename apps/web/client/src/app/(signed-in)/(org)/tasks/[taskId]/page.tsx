import { notFound, redirect } from 'next/navigation'

import { idSchema } from '@repo/shared'

import { ApiError } from '@/lib/api/errors'
import { projectById } from '@/lib/api/projects'
import { apiForRender } from '@/lib/api/server'
import { fetchTask } from '@/lib/api/tasks'

/**
 * `/tasks/<id>` — the address an email points at, resolved to the board the
 * task lives on with its drawer open.
 *
 * It exists because `TaskService.announce` sends exactly this link when
 * somebody is assigned, and until now it answered 404. The task detail has no
 * page of its own by design: docs/04-features/phase-1.md and the prototype both
 * put it in a drawer over the list, because what people do after opening one
 * task is look at the next. Landing straight in that drawer is what the link
 * meant; landing on a stranded page would lose the list it belongs to.
 *
 * Redirecting rather than rendering also makes the address self-repairing —
 * the reader ends up on a URL that names the project, which is the one they
 * will copy if they pass it on.
 *
 * A task that has been deleted, or whose project the reader has been removed
 * from, is a **404 and not a 403**: the API answers that way for the reason
 * `ProjectPage` gives, and confirming which ids exist is the thing that would
 * be given away.
 */
export default async function TaskPage({
  params,
}: {
  params: Promise<{ taskId: string }>
}) {
  const { taskId } = await params

  if (!idSchema('Invalid task id').safeParse(taskId).success) notFound()

  const api = await apiForRender()

  // Only the task and its project, not `detailFor`: the statuses and the
  // activity are fetched again by the page being redirected to, and asking for
  // them here would pay for them twice.
  const project = await taskProject(api, taskId)

  if (project === null) notFound()

  redirect(`/projects/${project.keyPrefix}?task=${taskId}`)
}

async function taskProject(
  api: Awaited<ReturnType<typeof apiForRender>>,
  taskId: string,
) {
  try {
    const task = await fetchTask(api, taskId)

    return await projectById(api, task.projectId)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null

    throw error
  }
}
