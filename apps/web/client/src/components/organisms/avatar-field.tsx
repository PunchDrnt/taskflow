'use client'

import { ImageUp, Loader2 } from 'lucide-react'
import { useRef, useState, useTransition } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar'
import { Button } from '@repo/ui/components/button'

import { avatarUploadTarget } from '../../app/(signed-in)/settings/profile/actions'
import {
  AVATAR_MAX_EDGE,
  compressForAvatar,
  ImageTooOdd,
} from '../../lib/image/compress'

/**
 * Choosing a profile picture: shrink it here, PUT it to storage, keep the key.
 *
 * Three steps, and the order is the point. The file is compressed **before**
 * a URL is even asked for, so nothing is signed for a picture that turns out
 * to be unreadable; then it goes straight to object storage without passing
 * through Node, which is what keeps the API from being a proxy whose memory
 * limit is the real file size limit; then only the key travels back, because
 * the bucket is private and no URL to an object keeps working.
 *
 * 🔒 The compression is the only size limit in the whole path — the signed URL
 * carries no `ContentLength` and no content-type condition. See
 * `lib/image/compress.ts`.
 *
 * The hidden input is what carries the key into the surrounding form, so the
 * picture and the rest of the profile are saved by one submission and a failed
 * save does not leave a new avatar half-applied.
 *
 * ⚠️ **It is always rendered, and carries the stored value when nothing new
 * was chosen.** `PATCH /v1/me` takes the whole profile, so an absent field is
 * not "leave it alone" — it is `null`, which clears the picture. Rendering the
 * input only after an upload meant that editing a nickname deleted the avatar.
 *
 * The existing picture is drawn through `GET /v1/users/:id/avatar` rather than
 * from the stored value, which is a **storage key** and not a URL: the bucket
 * is private, so that endpoint presigning and redirecting is the only thing
 * that turns a key back into an image.
 */
export function AvatarField({
  userId,
  storedValue,
  fallback,
}: {
  userId: string
  /** What `iam.users.avatar_url` holds: a storage key, a URL, or nothing. */
  storedValue: string | null
  fallback: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(
    storedValue === null ? null : `/api/v1/users/${userId}/avatar`,
  )
  const [key, setKey] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function choose(file: File) {
    setFailure(null)
    setNote(null)

    startTransition(async () => {
      let shrunk

      try {
        shrunk = await compressForAvatar(file)
      } catch (error) {
        setFailure(
          error instanceof ImageTooOdd
            ? error.message
            : 'That image could not be processed.',
        )

        return
      }

      const target = await avatarUploadTarget(shrunk.fileName)

      if (!target.ok) {
        setFailure(target.message)

        return
      }

      try {
        const response = await fetch(target.uploadUrl, {
          method: 'PUT',
          body: shrunk.blob,
          headers: { 'content-type': shrunk.blob.type },
        })

        if (!response.ok) {
          setFailure(`The upload was refused (${response.status}).`)

          return
        }
      } catch {
        // Nothing to report a status for: the browser blocks a PUT it has no
        // permission for before sending it, so there is no response here and
        // no request on the other side either. The rule itself is applied by
        // `StorageService.onModuleInit`; what it cannot supply is a route to
        // the bucket that a browser can actually reach.
        setFailure(
          'The picture could not be sent to storage. Check that it is reachable from this address.',
        )

        return
      }

      setKey(target.key)
      setPreview(URL.createObjectURL(shrunk.blob))
      setNote(
        `${shrunk.width}×${shrunk.height}, ${Math.round(shrunk.blob.size / 1024)}KB — saved when you save the profile`,
      )
    })
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar size="lg">
        {preview !== null && <AvatarImage src={preview} alt="" />}
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>

      <div className="flex flex-col gap-1">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]

            // Cleared so choosing the same file twice fires a change again,
            // which is what somebody does after a failure.
            event.target.value = ''

            if (file !== undefined) choose(file)
          }}
        />

        {/* The new key if one was uploaded, otherwise whatever is stored —
            never absent. An absent field means null to `PATCH /v1/me`, which
            is "remove the picture" and not "leave it alone". */}
        <input
          type="hidden"
          name="avatarUrl"
          value={key ?? storedValue ?? ''}
        />

        <Button
          type="button"
          variant="outline"
          color="primary"
          size="sm"
          className="w-fit"
          disabled={pending}
          onClick={() => input.current?.click()}
        >
          {pending ? <Loader2 className="animate-spin" /> : <ImageUp />}
          {pending ? 'Preparing' : 'Choose a picture'}
        </Button>

        {note !== null && (
          <span className="text-text-secondary body-3">{note}</span>
        )}
        {failure !== null && (
          <span className="text-error-main body-3" role="alert">
            {failure}
          </span>
        )}
        {note === null && failure === null && (
          <span className="text-text-disabled body-3">
            Shrunk to {AVATAR_MAX_EDGE}px and re-encoded here, which also strips
            the location a phone writes into the file.
          </span>
        )}
      </div>
    </div>
  )
}
