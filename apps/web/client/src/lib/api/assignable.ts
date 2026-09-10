import type { AxiosInstance } from 'axios'

import type { AssignableRow, Page } from '@repo/shared'

/**
 * Who this project can give work to, in two tiers.
 *
 * `scope=project` is the default and nearly always the answer; `scope=org`
 * is what the picker's "search the whole organisation" button asks for, and
 * every row says whether the person is already in the project so the client
 * knows which picks need a confirmation first.
 *
 * The middle tier the original spec had — "people you assigned recently",
 * computed from the activity log — was cut in the docs: the most expensive
 * query on the most frequently opened screen, to reorder something the first
 * tier already answers.
 */
export async function fetchAssignable(
  api: AxiosInstance,
  projectId: string,
  options: { q?: string; scope?: 'project' | 'org' } = {},
): Promise<AssignableRow[]> {
  const params = new URLSearchParams({ scope: options.scope ?? 'project' })

  if (options.q !== undefined && options.q !== '') params.set('q', options.q)

  const { data } = await api.get<Page<AssignableRow>>(
    `/projects/${projectId}/assignable?${params}`,
  )

  return data.data
}
