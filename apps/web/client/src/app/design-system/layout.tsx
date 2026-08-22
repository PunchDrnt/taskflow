import Link from 'next/link'

const navItems = [
  { href: '/design-system', label: 'Overview' },
  { href: '/design-system/colors', label: 'Colors' },
  { href: '/design-system/typography', label: 'Typography' },
  { href: '/design-system/buttons', label: 'Buttons' },
  { href: '/design-system/badges', label: 'Badges' },
  { href: '/design-system/forms', label: 'Forms' },
  { href: '/design-system/navigation', label: 'Navigation' },
  { href: '/design-system/feedback', label: 'Feedback' },
  { href: '/design-system/overlays', label: 'Overlays' },
  { href: '/design-system/data-display', label: 'Data display' },
]

export default function DesignSystemLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="bg-default text-text-primary min-h-screen">
      <div className="mx-auto max-w-5xl px-6 pb-24">
        <header className="border-divider flex items-center border-b py-6">
          <div>
            <h1 className="h2">Design System</h1>
            <p className="body-2 text-text-secondary">
              Live reference for every token and component in @repo/ui.
            </p>
          </div>
        </header>

        <nav className="border-divider flex flex-wrap gap-1 border-b py-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="label-small text-text-secondary hover:bg-action-hover hover:text-text-primary rounded-md px-3 py-1.5"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </div>
  )
}
