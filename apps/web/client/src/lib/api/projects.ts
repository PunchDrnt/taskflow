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
