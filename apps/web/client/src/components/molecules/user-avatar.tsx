import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar'

/**
 * Somebody's picture, from the one endpoint that can produce it.
 *
 * `avatarUrl` holds a **storage key**, not a URL, and the bucket is private —
 * so the key is never rendered. `GET /v1/users/:id/avatar` presigns and
 * redirects, which is the only thing that turns a key back into an image, and
 * a null key means there is nothing to presign and the initial stands in.
 */
export function UserAvatar({
  userId,
  avatarUrl,
  fallback,
  size,
  className,
}: {
  userId: string
  avatarUrl: string | null
  /** What to draw instead of a picture — an initial, not a whole name. */
  fallback: string
  size?: 'default' | 'sm' | 'lg'
  className?: string
}) {
  return (
    <Avatar size={size} className={className}>
      {avatarUrl !== null && (
        <AvatarImage src={`/api/v1/users/${userId}/avatar`} alt="" />
      )}
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  )
}

/** The first character of a nickname, upper-cased. Never more than one. */
export function initialOf(nickname: string): string {
  return [...nickname][0]?.toUpperCase() ?? '?'
}
