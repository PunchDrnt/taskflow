/**
 * `DEV-87` — the thing people paste into chat to point at a piece of work.
 *
 * Monospace and selectable on purpose: it exists to be read aloud and copied,
 * which is the whole reason a project carries a `key_prefix` at all. The API
 * assembles it at display time from the prefix and the number, so it is never
 * stored and never stale.
 */
export function TaskKey({ children }: { children: string }) {
  return (
    <span className="text-text-secondary body-3 font-mono tabular-nums">
      {children}
    </span>
  )
}
