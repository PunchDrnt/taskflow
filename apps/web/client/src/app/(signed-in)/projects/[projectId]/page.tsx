import { Settings2 } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import type { ProjectRow } from '@repo/shared'
import { Button } from '@repo/ui/components/button'

import { ProjectDot } from '../../../../components/atoms/project-dot'
import { QuickAdd } from '../../../../components/organisms/quick-add'
import { TaskList } from '../../../../components/organisms/task-list'
import { PROJECT_TASK_COLUMNS } from '../../../../components/organisms/task-list/columns'
import { TaskToolbar } from '../../../../components/organisms/task-toolbar'
import { ApiError } from '../../../../lib/api/errors'
import { apiForRender } from '../../../../lib/api/server'
import { fetchTasks, lookupsFor } from '../../../../lib/api/tasks'
import {
  parseTaskQuery,
  toURLSearchParams,
  type TaskScope,
} from '../../../../lib/tasks/query'

/**
 * One project: everything on its board, with a box to add to it.
 *
 * 🔒 A project the caller may not see is a **404, not a 403** — the API
 * decides that and this page passes it on. A 403 would confirm the id names a
 * real project in this organisation, which is exactly what somebody guessing
 * at ids is trying to learn.
 *
 * The list is the same component My Tasks uses, with one column dropped and a
 * different scope. That is the column registry doing its job: the difference
 * between the two screens is an array and an endpoint, not a second table.
 */
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { projectId } = await params
  const scope: TaskScope = { kind: 'project', projectId }

  const search = toURLSearchParams(await searchParams)
  const query = parseTaskQuery(search, scope)

  const api = await apiForRender()
  const project = await loadProject(api, projectId)
  const page = await fetchTasks(api, scope, query)
  const lookups = await lookupsFor(api, page.data)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="h6 flex items-center gap-2">
            <ProjectDot color={project.color} />
            {project.name}
            <span className="text-text-disabled body-2 font-mono">
              {project.keyPrefix}
            </span>
          </h1>
          {project.description !== null && (
            <p className="text-text-secondary body-2 mt-1">
              {project.description}
            </p>
          )}
        </div>

        <Button
          variant="outline"
          color="primary"
          size="sm"
          render={<Link href={`/projects/${projectId}/statuses`} />}
        >
          <Settings2 />
          Statuses
        </Button>
      </header>

      <QuickAdd projectId={projectId} />

      <TaskToolbar query={query} scope={scope} />

      {/* `key` remounts on a query change — the loaded rows are state and would
          otherwise have the new filter's results appended to them. */}
      <TaskList
        key={search.toString()}
        initialRows={page.data}
        initialCursor={page.meta.nextCursor}
        initialLookups={lookups}
        scope={scope}
        columns={PROJECT_TASK_COLUMNS}
        grouping={query.group}
        search={search.toString()}
      />
    </div>
  )
}

/** 404 for anything the API refuses, which is what it already answers. */
async function loadProject(
  api: Awaited<ReturnType<typeof apiForRender>>,
  projectId: string,
): Promise<ProjectRow> {
  try {
    return (await api.get<ProjectRow>(`/projects/${projectId}`)).data
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 400)
    ) {
      notFound()
    }

    throw error
  }
}
