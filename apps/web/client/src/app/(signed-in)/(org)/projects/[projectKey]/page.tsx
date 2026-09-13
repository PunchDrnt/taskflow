import { notFound } from 'next/navigation'

import type { ProjectRow } from '@repo/shared'

import { PageBody } from '../../../../../components/atoms/page-body'
import { ProjectDot } from '../../../../../components/atoms/project-dot'
import { QuickAdd } from '../../../../../components/organisms/quick-add'
import { TaskList } from '../../../../../components/organisms/task-list'
import { PROJECT_TASK_COLUMNS } from '../../../../../components/organisms/task-list/columns'
import { TaskToolbar } from '../../../../../components/organisms/task-toolbar'
import { fetchAssignable } from '../../../../../lib/api/assignable'
import { ApiError } from '../../../../../lib/api/errors'
import { currentUser } from '../../../../../lib/api/me'
import { apiForRender } from '../../../../../lib/api/server'
import { fetchStatuses } from '../../../../../lib/api/statuses'
import { fetchTasks, lookupsOf } from '../../../../../lib/api/tasks'
import {
  parseTaskQuery,
  toURLSearchParams,
  type TaskScope,
} from '../../../../../lib/tasks/query'

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

  // The project's own columns, not the ones its loaded tasks happen to sit
  // in: an empty board still has statuses, and the filter has to offer them.
  const [statuses, people, me] = await Promise.all([
    fetchStatuses(api, projectId),
    fetchAssignable(api, projectId),
    // Cached per request, so the layout above already paid for this one.
    currentUser(),
  ])

  const orgName =
    me?.organizations.find((org) => org.orgId === me.activeOrgId)?.name ?? null

  // Built from what is already here rather than fetched again. `lookupsFor`
  // is for a list that spans projects; inside one, both halves are in hand.
  const lookups = lookupsOf([project], statuses)

  return (
    <PageBody width="wide" className="gap-4">
      <header>
        {/* Which company this board belongs to, for the person who keeps two
            of them open in two tabs. */}
        {orgName !== null && (
          <p className="text-text-secondary body-3 mb-1.5">
            {orgName} <span className="text-text-disabled">/</span>{' '}
            {project.name}
          </p>
        )}
        <h1 className="h5 flex items-center gap-2">
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
      </header>

      {/* Above the box that adds a task, not below it: these decide what the
          list underneath contains, and the design reads them as belonging to
          the list rather than to the row that appends to it. */}
      <TaskToolbar
        query={query}
        scope={scope}
        statuses={statuses}
        people={people}
      />

      <QuickAdd
        projectId={projectId}
        projectName={project.name}
        defaultStatusName={
          statuses.find((status) => status.isDefault)?.name ?? null
        }
      />

      <TaskList
        initialRows={page.data}
        initialCursor={page.meta.nextCursor}
        initialLookups={lookups}
        scope={scope}
        columns={PROJECT_TASK_COLUMNS}
        query={query}
        search={search.toString()}
      />
    </PageBody>
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
