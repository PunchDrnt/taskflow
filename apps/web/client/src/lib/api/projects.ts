import type { AxiosInstance } from 'axios'

import type { Page, ProjectRow } from '@repo/shared'

/**
 * Every project in the active organisation the caller may see.
 *
 * The instance is a parameter rather than something this reaches for, because
 * the two callers need different ones: a Server Component gets `apiForRender`,
 * which must never refresh, and a Server Action gets `apiForAction`, which
 * must. Choosing in here would mean choosing wrongly for one of them.
 *
 * Archived projects are left out — the API's default — which is also why a
 * task list never has to filter them: `myTasks` already excludes their work.
 */
export async function fetchProjects(api: AxiosInstance): Promise<ProjectRow[]> {
  const { data } = await api.get<Page<ProjectRow>>('/projects')

  return data.data
}

/**
 * The project a URL segment names, or null.
 *
 * The segment is a **key prefix** — `/projects/DEV/settings` — because a UUID
 * in the address bar is something nobody can read, compare or say out loud.
 * It is resolved here, from the list, rather than by a lookup endpoint, and
 * that is the point: the prefix is renameable and belongs to the browser, so
 * everything sent to the API from this point on is `project.id`.
 *
 * Matched case-insensitively, so a hand-typed `/projects/dev` still opens. The
 * stored value is always uppercase — `keyPrefixSchema` and the table's CHECK
 * both say so — so uppercasing the segment is enough, with no second form to
 * keep in step.
 *
 * `includeArchived`, unlike every other caller: an archived project is hidden
 * from the sidebar and from pickers, but its screens still open, because
 * members keep their access and its history stays readable.
 *
 * Null covers both "no such prefix" and "not a project you may see" with one
 * answer, which is the 404 the API gives — a list nobody may see it in cannot
 * confirm it exists.
 */
export async function projectByKey(
  api: AxiosInstance,
  key: string,
): Promise<ProjectRow | null> {
  const wanted = key.toUpperCase()
  const { data } = await api.get<Page<ProjectRow>>('/projects', {
    params: { includeArchived: 'true' },
  })

  return data.data.find((project) => project.keyPrefix === wanted) ?? null
}
