import Link from 'next/link'

const sections = [
  {
    href: '/design-system/colors',
    title: 'Colors',
    description: 'Palette, states, surfaces',
  },
  {
    href: '/design-system/typography',
    title: 'Typography',
    description: 'Type scale & classes',
  },
  {
    href: '/design-system/buttons',
    title: 'Buttons',
    description: 'Variant × color grid',
  },
  {
    href: '/design-system/badges',
    title: 'Badges',
    description: 'Variant × color grid',
  },
  {
    href: '/design-system/forms',
    title: 'Forms',
    description: 'Input, select, checkbox, etc.',
  },
  {
    href: '/design-system/navigation',
    title: 'Navigation',
    description: 'Tabs, collapsible, sidebar',
  },
  {
    href: '/design-system/feedback',
    title: 'Feedback',
    description: 'Progress, skeleton, spinner, toast, tooltip',
  },
  {
    href: '/design-system/overlays',
    title: 'Overlays',
    description: 'Dialog, alert dialog, dropdown, popover, sheet',
  },
  {
    href: '/design-system/data-display',
    title: 'Data display',
    description: 'Table, avatar, attachment, more',
  },
]

export default function DesignSystemOverviewPage() {
  return (
    <div className="grid grid-cols-1 gap-4 py-8 sm:grid-cols-2 md:grid-cols-3">
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          className="border-divider hover:bg-action-hover flex flex-col gap-1 rounded-lg border p-4"
        >
          <span className="subtitle-2">{section.title}</span>
          <span className="body-2 text-text-secondary">
            {section.description}
          </span>
        </Link>
      ))}
    </div>
  )
}
