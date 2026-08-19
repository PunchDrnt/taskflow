'use client'

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { CheckIcon } from 'lucide-react'

import { cn } from '@repo/ui/lib/utils'

export type CheckboxColor =
  'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'

const colorClasses: Record<CheckboxColor, string> = {
  primary:
    'focus-visible:border-primary-main focus-visible:ring-primary-focus-visible data-checked:border-primary-main data-checked:bg-primary-main data-checked:text-primary-contrast',
  secondary:
    'focus-visible:border-secondary-main focus-visible:ring-secondary-focus-visible data-checked:border-secondary-main data-checked:bg-secondary-main data-checked:text-secondary-contrast',
  error:
    'focus-visible:border-error-main focus-visible:ring-error-focus-visible data-checked:border-error-main data-checked:bg-error-main data-checked:text-error-contrast',
  warning:
    'focus-visible:border-warning-main focus-visible:ring-warning-focus-visible data-checked:border-warning-main data-checked:bg-warning-main data-checked:text-warning-contrast',
  info: 'focus-visible:border-info-main focus-visible:ring-info-focus-visible data-checked:border-info-main data-checked:bg-info-main data-checked:text-info-contrast',
  success:
    'focus-visible:border-success-main focus-visible:ring-success-focus-visible data-checked:border-success-main data-checked:bg-success-main data-checked:text-success-contrast',
}

function Checkbox({
  className,
  color = 'primary',
  ...props
}: CheckboxPrimitive.Root.Props & { color?: CheckboxColor }) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer border-divider bg-action-hover relative flex size-4 shrink-0 items-center justify-center rounded-xs border transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
        colorClasses[color],
        'aria-invalid:border-error-main aria-invalid:ring-error-focus aria-invalid:ring-3',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
