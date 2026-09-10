/**
 * Where the browser should PUT a file, and what to call it afterwards.
 *
 * `key` and not a URL: the bucket is private and stays private, so no URL to
 * an object keeps working. The key is what `PATCH /v1/me` stores, and
 * `GET /v1/users/:id/avatar` is the only place it becomes a picture again.
 *
 * Its own module because a `'use server'` file may export nothing but async
 * functions — a type survives only by being erased at compile time.
 */
export type UploadTarget =
  { ok: true; uploadUrl: string; key: string } | { ok: false; message: string }
