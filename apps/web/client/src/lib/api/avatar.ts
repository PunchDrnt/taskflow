import { AVATAR_MAX_BYTES, type ApiErrorBody } from '@repo/shared'

/** What the caller gets back: a storage key to save, or something to show. */
export type AvatarUpload =
  { ok: true; key: string } | { ok: false; message: string }

/**
 * Sending a new profile picture to the API.
 *
 * **A browser fetch, not a Server Action, and that is the point.** An action
 * would carry the bytes into the Next server first and then out again to
 * Nest — three hops and a buffer in a process that has no use for the file.
 * `/api/*` is the same origin in both environments (a rewrite under `yarn dev`,
 * Caddy in production), so the session cookie rides along on its own and
 * `SameSite=Lax` needs no token.
 *
 * `Content-Type` is deliberately unset. The browser writes it, including the
 * multipart boundary it generated, and naming it here would send a header
 * whose boundary does not match the body.
 *
 * The size check is a courtesy so a hopeless upload is not sent at all; the
 * one that counts is `limits.fileSize` on the route, which aborts mid-stream.
 */
export async function uploadAvatar(
  blob: Blob,
  fileName: string,
): Promise<AvatarUpload> {
  if (blob.size > AVATAR_MAX_BYTES) {
    return {
      ok: false,
      message: `That picture is too large, even after shrinking (limit ${Math.round(AVATAR_MAX_BYTES / 1024)}KB).`,
    }
  }

  const body = new FormData()
  body.append('file', blob, fileName)

  let response: Response

  try {
    response = await fetch('/api/v1/me/avatar', { method: 'POST', body })
  } catch {
    // Offline, or the request was abandoned. There is no status to report.
    return { ok: false, message: 'The picture could not be sent. Try again.' }
  }

  if (!response.ok) {
    return { ok: false, message: await messageFrom(response) }
  }

  const { key } = (await response.json()) as { key: string }

  return { ok: true, key }
}

/**
 * The API's own words where it sent them, and a plain sentence where it did
 * not — a 413 from a proxy is HTML, and rendering a fragment of somebody
 * else's error page is worse than saying nothing useful.
 */
async function messageFrom(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>

    if (typeof body.message === 'string' && body.message !== '') {
      return body.message
    }
  } catch {
    // Not JSON. Fall through.
  }

  return `The upload was refused (${response.status}).`
}
