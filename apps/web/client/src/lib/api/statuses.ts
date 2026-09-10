import type { AxiosInstance } from 'axios'

import type { Page, StatusRow } from '@repo/shared'

/**
 * One project's statuses, in board order.
 *
 * There is no endpoint for "the statuses of these five projects", and there
 * should not be: statuses belong to a project the way columns belong to a
 * board, and a list route that crossed projects would be answering a question
 * only a cross-project screen asks. That screen asks it by fanning out — see
 * `lookupsFor` — over the handful of projects actually on the page.
 */
export async function fetchStatuses(
  api: AxiosInstance,
  projectId: string,
): Promise<StatusRow[]> {
  const { data } = await api.get<Page<StatusRow>>(
    `/projects/${projectId}/statuses`,
  )

  return data.data
}
