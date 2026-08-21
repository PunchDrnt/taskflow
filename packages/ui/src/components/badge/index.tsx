import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@repo/ui/lib/utils'

const badgeVariants = cva(
  'group/badge inline-flex w-fit shrink-0 items-center justify-center overflow-hidden rounded-4xl border border-transparent font-medium whitespace-nowrap transition-all focus-visible:border-primary-main focus-visible:ring-3 focus-visible:ring-primary-focus-visible aria-invalid:border-error-main aria-invalid:ring-error-focus [&>svg]:pointer-events-none',
  {
    variants: {
      variant: {
        default: '',
        secondary: '',
        outline: '',
        ghost: '',
        link: 'underline-offset-4 hover:underline',
      },
      color: {
        primary: '',
        secondary: '',
        tertiary: '',
        error: '',
        warning: '',
        info: '',
        success: '',
        neutral: '',
      },
      size: {
        sm: 'gap-0.5 px-1.5 py-0.5 body-3 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 [&>svg]:size-2.5!',
        default:
          'gap-1 px-2 py-1 body-2 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:size-3!',
        lg: 'gap-1.5 px-2.5 py-1.5 body-1 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&>svg]:size-3.5!',
      },
    },
    compoundVariants: [
      // primary
      {
        variant: 'default',
        color: 'primary',
        className:
          'bg-primary-main text-primary-contrast [a]:hover:bg-primary-dark',
      },
      {
        variant: 'secondary',
        color: 'primary',
        className:
          'bg-primary-soft text-primary-light [a]:hover:bg-primary-hover',
      },
      {
        variant: 'outline',
        color: 'primary',
        className:
          'border-primary-outlined-border bg-primary-soft text-primary-light [a]:hover:bg-primary-hover',
      },
      {
        variant: 'ghost',
        color: 'primary',
        className: 'text-primary-light hover:bg-primary-hover',
      },
      {
        variant: 'link',
        color: 'primary',
        className: 'text-primary-light',
      },

      // secondary
      {
        variant: 'default',
        color: 'secondary',
        className:
          'bg-secondary-main text-secondary-contrast [a]:hover:bg-secondary-dark',
      },
      {
        variant: 'secondary',
        color: 'secondary',
        className:
          'bg-secondary-soft text-secondary-light [a]:hover:bg-secondary-hover',
      },
      {
        variant: 'outline',
        color: 'secondary',
        className:
          'border-secondary-outlined-border bg-secondary-soft text-secondary-light [a]:hover:bg-secondary-hover',
      },
      {
        variant: 'ghost',
        color: 'secondary',
        className: 'text-secondary-light hover:bg-secondary-hover',
      },
      {
        variant: 'link',
        color: 'secondary',
        className: 'text-secondary-light',
      },

      // tertiary
      {
        variant: 'default',
        color: 'tertiary',
        className:
          'bg-tertiary-main text-tertiary-contrast [a]:hover:bg-tertiary-dark',
      },
      {
        variant: 'secondary',
        color: 'tertiary',
        className:
          'bg-tertiary-soft text-tertiary-light [a]:hover:bg-tertiary-hover',
      },
      {
        variant: 'outline',
        color: 'tertiary',
        className:
          'border-tertiary-outlined-border bg-tertiary-soft text-tertiary-light [a]:hover:bg-tertiary-hover',
      },
      {
        variant: 'ghost',
        color: 'tertiary',
        className: 'text-tertiary-light hover:bg-tertiary-hover',
      },
      {
        variant: 'link',
        color: 'tertiary',
        className: 'text-tertiary-light',
      },

      // error
      {
        variant: 'default',
        color: 'error',
        className: 'bg-error-main text-error-contrast [a]:hover:bg-error-dark',
      },
      {
        variant: 'secondary',
        color: 'error',
        className: 'bg-error-soft text-error-light [a]:hover:bg-error-hover',
      },
      {
        variant: 'outline',
        color: 'error',
        className:
          'border-error-outlined-border bg-error-soft text-error-light [a]:hover:bg-error-hover',
      },
      {
        variant: 'ghost',
        color: 'error',
        className: 'text-error-light hover:bg-error-hover',
      },
      {
        variant: 'link',
        color: 'error',
        className: 'text-error-light',
      },

      // warning
      {
        variant: 'default',
        color: 'warning',
        className:
          'bg-warning-main text-warning-contrast [a]:hover:bg-warning-dark',
      },
      {
        variant: 'secondary',
        color: 'warning',
        className:
          'bg-warning-soft text-warning-light [a]:hover:bg-warning-hover',
      },
      {
        variant: 'outline',
        color: 'warning',
        className:
          'border-warning-outlined-border bg-warning-soft text-warning-light [a]:hover:bg-warning-hover',
      },
      {
        variant: 'ghost',
        color: 'warning',
        className: 'text-warning-light hover:bg-warning-hover',
      },
      {
        variant: 'link',
        color: 'warning',
        className: 'text-warning-light',
      },

      // info
      {
        variant: 'default',
        color: 'info',
        className: 'bg-info-main text-info-contrast [a]:hover:bg-info-dark',
      },
      {
        variant: 'secondary',
        color: 'info',
        className: 'bg-info-soft text-info-light [a]:hover:bg-info-hover',
      },
      {
        variant: 'outline',
        color: 'info',
        className:
          'border-info-outlined-border bg-info-soft text-info-light [a]:hover:bg-info-hover',
      },
      {
        variant: 'ghost',
        color: 'info',
        className: 'text-info-light hover:bg-info-hover',
      },
      {
        variant: 'link',
        color: 'info',
        className: 'text-info-light',
      },

      // success
      {
        variant: 'default',
        color: 'success',
        className:
          'bg-success-main text-success-contrast [a]:hover:bg-success-dark',
      },
      {
        variant: 'secondary',
        color: 'success',
        className:
          'bg-success-soft text-success-light [a]:hover:bg-success-hover',
      },
      {
        variant: 'outline',
        color: 'success',
        className:
          'border-success-outlined-border bg-success-soft text-success-light [a]:hover:bg-success-hover',
      },
      {
        variant: 'ghost',
        color: 'success',
        className: 'text-success-light hover:bg-success-hover',
      },
      {
        variant: 'link',
        color: 'success',
        className: 'text-success-light',
      },

      // neutral
      {
        variant: 'default',
        color: 'neutral',
        className: 'bg-black-main text-white-main [a]:hover:bg-black-secondary',
      },
      {
        variant: 'secondary',
        color: 'neutral',
        className:
          'bg-action-selected text-text-primary [a]:hover:bg-action-hover',
      },
      {
        variant: 'outline',
        color: 'neutral',
        className:
          'border-black-outlined-border text-text-primary [a]:hover:bg-action-hover',
      },
      {
        variant: 'ghost',
        color: 'neutral',
        className: 'text-text-primary hover:bg-action-hover',
      },
      { variant: 'link', color: 'neutral', className: 'text-text-primary' },
    ],
    defaultVariants: {
      variant: 'default',
      color: 'primary',
      size: 'default',
    },
  },
)

function Badge({
  className,
  variant = 'default',
  color = 'primary',
  size = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant, color, size }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
      color,
      size,
    },
  })
}

export { Badge, badgeVariants }
