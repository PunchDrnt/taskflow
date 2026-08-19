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
  ...props
}: RadioPrimitive.Root.Props & { color?: RadioColor }) {
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
