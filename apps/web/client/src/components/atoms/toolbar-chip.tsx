import { cn } from '@repo/ui/lib/utils'

/**
 * One control in a list's toolbar: what it is, and what it is set to.
 *
 * Not a `Button`. A toolbar control is off most of the time, and a row of
 * outlined or filled buttons draws the eye to controls nobody has touched —
 * so the resting state here is plain text on no background, and the accent is
 * spent only on the ones actually doing something. That is the design's rule
 * and it is the whole reason this is a component rather than a `variant`:
 * `Button` has no variant that is invisible until it matters.
 *
 * `value` carries both jobs — the label of what is set, and the fact that
 * anything is. `null` means off; a string means on and says what to. Sorting
 * therefore passes `null` while it is on the list's own default order, since
 * a chip that is lit from the moment the page loads tells nobody anything.
 */
export function ToolbarChip({
  icon,
  label,
  value,
  className,
  ...props
}: // `value` on a <button> is its form value, which this is not — a chip is
// never submitted, and leaving the native prop in place would let a string
// meant for the eye end up in a form payload.
Omit<React.ComponentProps<'button'>, 'value'> & {
  icon: React.ReactNode
  label: string
  /** What the control is set to, or `null` when it is off. */
  value: string | null
}) {
  return (
    <button
      type="button"
      className={cn(
        'body-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 whitespace-nowrap',
        'hover:bg-action-hover [&_svg]:size-3',
        value === null
          ? 'text-text-secondary hover:text-text-primary'
          : 'bg-primary-soft text-primary-main font-medium',
        className,
      )}
      {...props}
    >
      {icon}
      {label}
      {value !== null && (
        <>
          <span aria-hidden className="opacity-60">
            ·
          </span>
          {value}
        </>
      )}
    </button>
  )
}
