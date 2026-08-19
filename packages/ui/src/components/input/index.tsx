import { Input as InputPrimitive } from '@base-ui/react/input'
import * as React from 'react'

import { cn } from '@repo/ui/lib/utils'

export type InputColor =
  'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'

const colorClasses: Record<InputColor, string> = {
  primary:
    'focus-visible:border-primary-main focus-visible:ring-primary-focus-visible',
  secondary:
    'focus-visible:border-secondary-main focus-visible:ring-secondary-focus-visible',
  error:
    'focus-visible:border-error-main focus-visible:ring-error-focus-visible',
  warning:
    'focus-visible:border-warning-main focus-visible:ring-warning-focus-visible',
  info: 'focus-visible:border-info-main focus-visible:ring-info-focus-visible',
  success:
    'focus-visible:border-success-main focus-visible:ring-success-focus-visible',
}

function Input({
  className,
  type,
  color = 'primary',
  ...props
}: Omit<React.ComponentProps<'input'>, 'color'> & { color?: InputColor }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'border-divider file:text-text-primary placeholder:text-text-secondary disabled:bg-action-disabled-background bg-action-hover h-8 w-full min-w-0 rounded-lg border px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        colorClasses[color],
        'aria-invalid:border-error-main aria-invalid:ring-error-focus aria-invalid:ring-3',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
