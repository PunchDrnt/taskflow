import type { StatusColor } from '@repo/shared'

/**
 * A project's colour, as a dot.
 *
 * ⚠️ The token is `--color-status-<name>-main`, not `--color-<name>-main`.
 * There is no `--color-blue-*` in this theme — `theme.css` sets
 * `--color-*: initial`, which clears Tailwind's palette outright, and the
 * eight palette colours are declared under the `status` prefix because a
 * project's colour and a status's colour are drawn from the same eight. The
 * shorter spelling resolves to nothing and falls through to the fallback, so
 * it fails as "every dot is the text colour" rather than as an error.
 *
 * Never the only signal — the project's name sits beside it in every use, for
 * the reason the status badge carries its name: colour alone excludes the
 * ~8% of men with a colour vision deficiency.
 */
export function ProjectDot({ color }: { color: StatusColor }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: `var(--color-status-${color}-main)` }}
    />
  )
}
