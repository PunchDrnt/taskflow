'use client'

import { Radio as RadioPrimitive } from '@base-ui/react/radio'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'

import { cn } from '@repo/ui/lib/utils'

export type RadioColor =
  'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'

const colorClasses: Record<RadioColor, string> = {
  primary:
    'focus-visible:border-primary-main focus-visible:ring-primary-focus-visible aria-invalid:aria-checked:border-primary-main data-checked:border-primary-main data-checked:bg-primary-main data-checked:text-primary-contrast',
  secondary:
    'focus-visible:border-secondary-main focus-visible:ring-secondary-focus-visible aria-invalid:aria-checked:border-secondary-main data-checked:border-secondary-main data-checked:bg-secondary-main data-checked:text-secondary-contrast',
  error:
    'focus-visible:border-error-main focus-visible:ring-error-focus-visible aria-invalid:aria-checked:border-error-main data-checked:border-error-main data-checked:bg-error-main data-checked:text-error-contrast',
  warning:
    'focus-visible:border-warning-main focus-visible:ring-warning-focus-visible aria-invalid:aria-checked:border-warning-main data-checked:border-warning-main data-checked:bg-warning-main data-checked:text-warning-contrast',
  info: 'focus-visible:border-info-main focus-visible:ring-info-focus-visible aria-invalid:aria-checked:border-info-main data-checked:border-info-main data-checked:bg-info-main data-checked:text-info-contrast',
  success:
    'focus-visible:border-success-main focus-visible:ring-success-focus-visible aria-invalid:aria-checked:border-success-main data-checked:border-success-main data-checked:bg-success-main data-checked:text-success-contrast',
}

/**
 * How one option is drawn.
 *
 * `dot` is the control everybody knows, and the default. `pill` is the same
 * choice wearing its own label: one option in a row of them, checked or not,
 * for a set that sits among other controls rather than under a legend. The
 * semantics are identical — one tab stop for the group, arrow keys between the
 * options, `role="radio"` on each — so the difference is only what the eye
 * gets. A `pill` takes its label from `children`; a `dot` ignores them.
 */
export type RadioVariant = 'dot' | 'pill'

const pillClasses: Record<RadioColor, string> = {
  primary:
    'focus-visible:ring-primary-focus-visible data-checked:border-primary-outlined-border data-checked:bg-primary-soft data-checked:text-primary-light',
  secondary:
    'focus-visible:ring-secondary-focus-visible data-checked:border-secondary-outlined-border data-checked:bg-secondary-soft data-checked:text-secondary-light',
  error:
    'focus-visible:ring-error-focus-visible data-checked:border-error-outlined-border data-checked:bg-error-soft data-checked:text-error-light',
  warning:
    'focus-visible:ring-warning-focus-visible data-checked:border-warning-outlined-border data-checked:bg-warning-soft data-checked:text-warning-light',
  info: 'focus-visible:ring-info-focus-visible data-checked:border-info-outlined-border data-checked:bg-info-soft data-checked:text-info-light',
  success:
    'focus-visible:ring-success-focus-visible data-checked:border-success-outlined-border data-checked:bg-success-soft data-checked:text-success-light',
}

const contrastClasses: Record<RadioColor, string> = {
  primary: 'bg-primary-contrast',
  secondary: 'bg-secondary-contrast',
  error: 'bg-error-contrast',
  warning: 'bg-warning-contrast',
  info: 'bg-info-contrast',
  success: 'bg-success-contrast',
}

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn('grid w-full gap-2', className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  color = 'primary',
  variant = 'dot',
  children,
  ...props
}: RadioPrimitive.Root.Props & {
  color?: RadioColor
  variant?: RadioVariant
}) {
  if (variant === 'pill') {
    return (
      <RadioPrimitive.Root
        data-slot="radio-group-item"
        data-variant="pill"
        className={cn(
          'peer border-divider text-text-disabled body-3 inline-flex shrink-0 items-center justify-center rounded-full border px-2 py-0.5 outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
          'not-data-checked:hover:text-text-secondary',
          pillClasses[color],
          'aria-invalid:border-error-main aria-invalid:ring-error-focus aria-invalid:ring-3',
          className,
        )}
        {...props}
      >
        {children}
      </RadioPrimitive.Root>
    )
  }

  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        'group/radio-group-item peer border-divider bg-action-hover relative flex aspect-square size-4 shrink-0 rounded-full border outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
        colorClasses[color],
        'aria-invalid:border-error-main aria-invalid:ring-error-focus aria-invalid:ring-3',
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-4 items-center justify-center"
      >
        <span
          className={cn(
            'absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full',
            contrastClasses[color],
          )}
        />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
