/**
 * A project's colour, as a dot.
 *
 * Never the only signal — the project's name sits beside it in every use, for
 * the reason the status badge carries its name: colour alone excludes the
 * ~8% of men with a colour vision deficiency.
 */
export function OrgDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: `var(--color-${color}-main, currentColor)` }}
    />
  )
}
