import { Badge } from '@repo/ui/components/badge'

import { colors } from '../_lib/shared'

const badgeVariants = ['default', 'secondary', 'outline', 'ghost'] as const

export default function BadgesPage() {
  return (
    <div className="flex flex-col gap-3 py-8">
      {badgeVariants.map((variant) => (
        <div key={variant} className="flex flex-wrap items-center gap-2">
          <span className="label-small text-text-secondary w-20 shrink-0 capitalize">
            {variant}
          </span>
          {colors.map((color) => (
            <Badge key={color} variant={variant} color={color}>
              {color}
            </Badge>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <span className="label-small text-text-secondary w-20 shrink-0">
          Sizes
        </span>
        <Badge size="sm">sm</Badge>
        <Badge size="default">default</Badge>
        <Badge size="lg">lg</Badge>
      </div>
    </div>
  )
}
