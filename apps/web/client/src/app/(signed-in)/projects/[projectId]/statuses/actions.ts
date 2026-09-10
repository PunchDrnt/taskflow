'use server'

import { revalidatePath } from 'next/cache'

import {
  createStatusSchema,
  idSchema,
  updateStatusSchema,
  type StatusRow,
} from '@repo/shared'

import { toApiError } from '../../../../../lib/api/errors'
import { apiForAction } from '../../../../../lib/api/server'
import type { StatusOutcome } from '../../../../../lib/statuses/outcome'

/**
 * The settings screen's four writes, each one a whole request.
 *
 * Every one of them revalidates the page rather than returning a patched row.
 * That is not laziness: this table is held together by four rules no single
 * row can express — a project always keeps one status, one that counts as
 * finished, and exactly one default, and none of them may be the one being
 * deleted. Editing one row can therefore change another, and a client that
 * patched only what it touched would draw a board the server does not have.
 */

export async function addStatus(
  projectId: string,
  form: { name: string; color: string; kind: string },
): Promise<StatusOutcome> {
  if (!isId(projectId)) return failed('That project does not exist.')

  const parsed = createStatusSchema.safeParse(form)

  if (!parsed.success) {
    return failed(parsed.error.issues[0]?.message ?? 'Check the status')
  }

  return write(projectId, async () => {
    const api = await apiForAction()
    await api.post<StatusRow>(`/projects/${projectId}/statuses`, parsed.data)
  })
}

/**
 * Rename, recolour, re-type, make default, or move — all one PATCH.
 *
 * ⚠️ Position is `afterId`, the neighbour to sit behind, and never the
 * `sort_order` key itself. The key is fractional-index arithmetic that is only
 * correct against the *current* neighbours, so a client computing one from the
 * list it happens to be holding writes a row into the wrong place with nothing
 * to indicate it. "Which one should it follow" is the part the browser knows.
 */
export async function changeStatus(
  projectId: string,
  statusId: string,
  patch: Record<string, unknown>,
): Promise<StatusOutcome> {
  if (!isId(projectId) || !isId(statusId)) {
    return failed('That status does not exist.')
  }

  const parsed = updateStatusSchema.safeParse(patch)

  if (!parsed.success) {
    return failed(parsed.error.issues[0]?.message ?? 'Check the status')
  }

  return write(projectId, async () => {
    const api = await apiForAction()
    await api.patch(`/projects/${projectId}/statuses/${statusId}`, parsed.data)
  })
}

export async function removeStatus(
  projectId: string,
  statusId: string,
): Promise<StatusOutcome> {
  if (!isId(projectId) || !isId(statusId)) {
    return failed('That status does not exist.')
  }

  return write(projectId, async () => {
    const api = await apiForAction()
    await api.delete(`/projects/${projectId}/statuses/${statusId}`)
  })
}

async function write(
  projectId: string,
  run: () => Promise<void>,
): Promise<StatusOutcome> {
  try {
    await run()
  } catch (error) {
    return failed(toApiError(error).message)
  }

  revalidatePath(`/projects/${projectId}/statuses`)
  // The board itself changes too — a renamed column, a new default, a
  // different order — and it is the screen people are on either side of this.
  revalidatePath(`/projects/${projectId}`)

  return { ok: true }
}

function failed(message: string): StatusOutcome {
  return { ok: false, message }
}

function isId(value: string): boolean {
  return idSchema('Invalid id').safeParse(value).success
}
