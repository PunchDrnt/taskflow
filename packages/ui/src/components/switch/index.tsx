'use client'

import { Switch as SwitchPrimitive } from '@base-ui/react/switch'

import { cn } from '@repo/ui/lib/utils'

export type SwitchColor =
  'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'

const colorClasses: Record<SwitchColor, string> = {
  primary: 'data-checked:bg-primary-main',
  secondary: 'data-checked:bg-secondary-main',
  error: 'data-checked:bg-error-main',
  warning: 'data-checked:bg-warning-main',
  info: 'data-checked:bg-info-main',
  success: 'data-checked:bg-success-main',
}

const contrastClasses: Record<SwitchColor, string> = {
  primary: 'data-checked:bg-primary-contrast',
  secondary: 'data-checked:bg-secondary-contrast',
  error: 'data-checked:bg-error-contrast',
  warning: 'data-checked:bg-warning-contrast',
  info: 'data-checked:bg-info-contrast',
  success: 'data-checked:bg-success-contrast',
}

function Switch({
  className,
  size = 'default',
  color = 'primary',
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: 'sm' | 'default'
  color?: SwitchColor
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch focus-visible:border-primary-main focus-visible:ring-primary-focus-visible data-unchecked:bg-action-disabled-background-100 relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[size=default]:h-[18.4px] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6',
        colorClasses[color],
        'aria-invalid:border-error-main aria-invalid:ring-error-focus aria-invalid:ring-3',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'bg-default pointer-events-none block rounded-full ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0',
          contrastClasses[color],
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
