import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@repo/ui/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-primary-main focus-visible:ring-3 focus-visible:ring-primary-focus-visible active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-error-main aria-invalid:ring-3 aria-invalid:ring-error-focus aria-expanded:bg-action-hover aria-expanded:text-text-primary [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: '',
        outline: 'border',
        secondary: '',
        ghost: '',
        link: 'underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
      color: {
        primary: '',
        secondary: '',
        error: '',
        warning: '',
        info: '',
        success: '',
        neutral: '',
      },
    },
    compoundVariants: [
      // primary
      {
        variant: 'default',
        color: 'primary',
        className:
          'bg-primary-main text-primary-contrast hover:bg-primary-dark active:bg-primary-darker disabled:bg-action-disabled-background disabled:text-text-disabled',
      },
      {
        variant: 'outline',
        color: 'primary',
        className:
          'border-primary-outlined-border bg-transparent text-primary-dark hover:bg-primary-hover active:bg-primary-selected disabled:border-divider disabled:bg-transparent disabled:text-text-disabled',
      },
      {
        variant: 'secondary',
        color: 'primary',
        className:
          'bg-primary-soft text-primary-dark hover:bg-primary-hover active:bg-primary-selected disabled:bg-action-disabled-background disabled:text-text-disabled',
      },
      {
        variant: 'ghost',
        color: 'primary',
        className:
          'bg-transparent text-primary-dark hover:bg-primary-hover active:bg-primary-selected disabled:text-text-disabled',
      },
      {
        variant: 'link',
        color: 'primary',
        className: 'text-primary-dark disabled:text-text-disabled',
      },

      // secondary
      {
        variant: 'default',
        color: 'secondary',
        className:
          'bg-secondary-main text-secondary-contrast hover:bg-secondary-dark active:bg-secondary-darker disabled:bg-action-disabled-background disabled:text-text-disabled',
      },
      {
        variant: 'outline',
        color: 'secondary',
        className:
          'border-secondary-outlined-border bg-transparent text-secondary-dark hover:bg-secondary-hover active:bg-secondary-selected disabled:border-divider disabled:bg-transparent disabled:text-text-disabled',
      },
      {
        variant: 'secondary',
        color: 'secondary',
        className:
          'bg-secondary-soft text-secondary-dark hover:bg-secondary-hover active:bg-secondary-selected disabled:bg-action-disabled-background disabled:text-text-disabled',
      },
      {
        variant: 'ghost',
        color: 'secondary',
        className:
          'bg-transparent text-secondary-dark hover:bg-secondary-hover active:bg-secondary-selected disabled:text-text-disabled',
      },
      {
        variant: 'link',
        color: 'secondary',
        className: 'text-secondary-dark disabled:text-text-disabled',
      },

      // error
      {
        variant: 'default',
        color: 'error',
        className:
          'bg-error-main text-error-contrast hover:bg-error-dark active:bg-error-darker disabled:bg-action-disabled-background disabled:text-text-disabled',
      },
      {
        variant: 'outline',
        color: 'error',
        className:
          'border-error-outlined-border bg-transparent text-error-dark hover:bg-error-hover active:bg-error-selected disabled:border-divider disabled:bg-transparent disabled:text-text-disabled',
      },
      {
        variant: 'secondary',
        color: 'error',
        className:
          'bg-error-soft text-error-dark hover:bg-error-hover active:bg-error-selected disabled:bg-action-disabled-background disabled:text-text-disabled',
      },
      {
        variant: 'ghost',
        color: 'error',
        className:
          'bg-transparent text-error-dark hover:bg-error-hover active:bg-error-selected disabled:text-text-disabled',
      },
      {
        variant: 'link',
        color: 'error',
        className: 'text-error-dark disabled:text-text-disabled',
      },

      // warning
      {
        variant: 'default',
        color: 'warning',
        className:
          'bg-warning-main text-warning-contrast hover:bg-warning-dark active:bg-warning-darker disabled:bg-action-disabled-background disabled:text-text-disabled',
      },
      {
        variant: 'outline',
        color: 'warning',
        className:
          'border-warning-outlined-border bg-transparent text-warning-dark hover:bg-warning-hover active:bg-warning-selected disabled:border-divider disabled:bg-transparent disabled:text-text-disabled',
      },
      {
        variant: 'secondary',
        color: 'warning',
        className:
          'bg-warning-soft text-warning-dark hover:bg-warning-hover active:bg-warning-selected disabled:bg-action-disabled-background disabled:text-text-disabled',
      },
      {
        variant: 'ghost',
        color: 'warning',
        className:
          'bg-transparent text-warning-dark hover:bg-warning-hover active:bg-warning-selected disabled:text-text-disabled',
      },
      {
        variant: 'link',
        color: 'warning',
        className: 'text-warning-dark disabled:text-text-disabled',
      },

      // info
      {
        variant: 'default',
        color: 'info',
        className:
          'bg-info-main text-info-contrast hover:bg-info-dark active:bg-info-darker disabled:bg-action-disabled-background disabled:text-text-disabled',
      },
      {
        variant: 'outline',
        color: 'info',
        className:
          'border-info-outlined-border bg-transparent text-info-dark hover:bg-info-hover active:bg-info-selected disabled:border-divider disabled:bg-transparent disabled:text-text-disabled',
      },
      {
        variant: 'secondary',
        color: 'info',
        className:
          'bg-info-soft text-info-dark hover:bg-info-hover active:bg-info-selected disabled:bg-action-disabled-background disabled:text-text-disabled',
      },
      {
        variant: 'ghost',
        color: 'info',
        className:
          'bg-transparent text-info-dark hover:bg-info-hover active:bg-info-selected disabled:text-text-disabled',
      },
      {
        variant: 'link',
        color: 'info',
        className: 'text-info-dark disabled:text-text-disabled',
      },

      // success
      {
        variant: 'default',
        color: 'success',
        className:
          'bg-success-main text-success-contrast hover:bg-success-dark active:bg-success-darker disabled:bg-action-disabled-background disabled:text-text-disabled',
      },
      {
        variant: 'outline',
        color: 'success',
        className:
          'border-success-outlined-border bg-transparent text-success-dark hover:bg-success-hover active:bg-success-selected disabled:border-divider disabled:bg-transparent disabled:text-text-disabled',
      },
      {
        variant: 'secondary',
        color: 'success',
        className:
          'bg-success-soft text-success-dark hover:bg-success-hover active:bg-success-selected disabled:bg-action-disabled-background disabled:text-text-disabled',
      },
      {
        variant: 'ghost',
        color: 'success',
        className:
          'bg-transparent text-success-dark hover:bg-success-hover active:bg-success-selected disabled:text-text-disabled',
      },
      {
        variant: 'link',
        color: 'success',
        className: 'text-success-dark disabled:text-text-disabled',
      },

      // neutral
      {
        variant: 'default',
        color: 'neutral',
        className:
          'bg-black-main text-white-main hover:bg-black-secondary active:bg-black-focus-visible disabled:bg-action-disabled-background disabled:text-text-disabled',
      },
      {
        variant: 'outline',
        color: 'neutral',
        className:
          'border-black-outlined-border bg-transparent text-text-primary hover:bg-action-hover active:bg-action-selected disabled:border-divider disabled:bg-transparent disabled:text-text-disabled',
      },
      {
        variant: 'secondary',
        color: 'neutral',
        className:
          'bg-action-selected text-text-primary hover:bg-action-hover active:bg-action-selected disabled:bg-action-disabled-background disabled:text-text-disabled',
      },
      {
        variant: 'ghost',
        color: 'neutral',
        className:
          'bg-transparent text-text-primary hover:bg-action-hover active:bg-action-selected disabled:text-text-disabled',
      },
      {
        variant: 'link',
        color: 'neutral',
        className: 'text-text-primary disabled:text-text-disabled',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
      color: 'primary',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  color = 'primary',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, color, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
