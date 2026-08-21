import * as React from 'react'

import { cn } from '@repo/ui/lib/utils'

export type TextareaColor =
  'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'

const colorClasses: Record<TextareaColor, string> = {
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

function Textarea({
  className,
  color = 'primary',
  ...props
}: Omit<React.ComponentProps<'textarea'>, 'color'> & {
  color?: TextareaColor
}) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-divider placeholder:text-text-secondary disabled:bg-action-disabled-background bg-action-hover text-body-lg md:text-body-md flex field-sizing-content min-h-16 w-full rounded-lg border px-2.5 py-2 transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
        colorClasses[color],
        'aria-invalid:border-error-main aria-invalid:ring-error-focus aria-invalid:ring-3',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
