export const buttonVariants = [
  'default',
  'outline',
  'secondary',
  'ghost',
  'link',
] as const
export const colors = [
  'primary',
  'secondary',
  'error',
  'warning',
  'info',
  'success',
  'neutral',
] as const

export const paletteFamilies = [
  'primary',
  'secondary',
  'error',
  'warning',
  'info',
  'success',
] as const

// Literal class strings (Tailwind's scanner can't see dynamically-built `bg-${x}` strings).
export const paletteClasses: Record<
  (typeof paletteFamilies)[number],
  { main: string; dark: string; light: string; contrast: string }
> = {
  primary: {
    main: 'bg-primary-main',
    dark: 'bg-primary-dark',
    light: 'bg-primary-light',
    contrast: 'bg-primary-contrast',
  },
  secondary: {
    main: 'bg-secondary-main',
    dark: 'bg-secondary-dark',
    light: 'bg-secondary-light',
    contrast: 'bg-secondary-contrast',
  },
  error: {
    main: 'bg-error-main',
    dark: 'bg-error-dark',
    light: 'bg-error-light',
    contrast: 'bg-error-contrast',
  },
  warning: {
    main: 'bg-warning-main',
    dark: 'bg-warning-dark',
    light: 'bg-warning-light',
    contrast: 'bg-warning-contrast',
  },
  info: {
    main: 'bg-info-main',
    dark: 'bg-info-dark',
    light: 'bg-info-light',
    contrast: 'bg-info-contrast',
  },
  success: {
    main: 'bg-success-main',
    dark: 'bg-success-dark',
    light: 'bg-success-light',
    contrast: 'bg-success-contrast',
  },
}

export function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 py-8">
      <h2 className="h3 border-divider border-b pb-2">{title}</h2>
      {children}
    </section>
  )
}

export function Swatch({
  label,
  className,
}: {
  label: string
  className: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`border-divider h-14 w-full rounded-md border ${className}`}
      />
      <span className="caption text-text-secondary">{label}</span>
    </div>
  )
}
