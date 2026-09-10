import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import type { ProjectRow } from '@repo/shared'
import { Button } from '@repo/ui/components/button'

import { ProjectDot } from '../../../../../components/atoms/project-dot'
import { StatusSettings } from '../../../../../components/organisms/status-settings'
import { ApiError } from '../../../../../lib/api/errors'
import { apiForRender } from '../../../../../lib/api/server'
import { fetchStatuses } from '../../../../../lib/api/statuses'

/**
 * A project's statuses — the columns of its board.
 *
 * Custom per project, which is why this screen exists at all: the four a new
 * project starts with (To do, In progress, Done, Cancelled) are a starting
 * point, not the set. Cancelled is among them from the start on purpose —
 * Phase 2's sub-task progress takes cancelled work out of the denominator, and
 * a project without one gets abandoned work marked Done instead, which makes
 * every closed sprint's numbers wrong retrospectively.
 */
export default async function StatusesPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const api = await apiForRender()

  let project: ProjectRow

  try {
    project = (await api.get<ProjectRow>(`/projects/${projectId}`)).data
  } catch (error) {
    // 404 rather than 403 for a project they cannot see — the API decides
    // that and this passes it on, because a 403 confirms the id is real.
    if (error instanceof ApiError && [400, 404].includes(error.status)) {
      notFound()
    }

    throw error
  }

  const statuses = await fetchStatuses(api, projectId)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-3">
        <Button
          variant="ghost"
          color="primary"
          size="sm"
          className="w-fit"
          render={<Link href={`/projects/${projectId}`} />}
        >
          <ArrowLeft />
          {project.name}
        </Button>

        <div>
          <h1 className="h6 flex items-center gap-2">
            <ProjectDot color={project.color} />
            Statuses
          </h1>
          <p className="text-text-secondary body-2 mt-1">
            The columns of this board. Drag to reorder. A status counting as
            done or cancelled changes what the tasks in it report — the number
            beside each row is how many that would be.
          </p>
        </div>
      </header>

      <StatusSettings projectId={projectId} statuses={statuses} />
    </div>
  )
}
