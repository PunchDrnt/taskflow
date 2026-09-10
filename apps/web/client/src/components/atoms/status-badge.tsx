import type { StatusRow } from '@repo/shared'

/**
 * A project's status, drawn as its own colour and **always its name**.
 *
 * 🔒 The name is not optional decoration. Around 8% of men have some colour
 * vision deficiency, and a board whose columns differ only by hue is a board
 * they cannot read — docs/04-features/phase-1.md makes carrying the word a
 * requirement rather than a nicety.
 *
 * "Pale fill, dark text" in the spec means *low contrast fill, high contrast
 * text*, and on a dark ground that comes out the other way round: `-soft` is a
 * ~13% wash of the colour and `-text` is a light tint of it. Both are theme
 * tokens, so the pairing stays legible without this component knowing which
 * way round the theme is.
 *
 * The colour is a token name (`green`), never a hex value, which is what lets
 * it be re-themed at all.
 */
export function StatusBadge({ status }: { status: StatusRow }) {
  return (
    <span
      className="body-3 inline-flex w-fit items-center rounded-4xl px-2 py-0.5 whitespace-nowrap"
      style={{
        backgroundColor: `var(--color-status-${status.color}-soft)`,
        color: `var(--color-status-${status.color}-text)`,
      }}
    >
      {status.name}
    </span>
  )
}
