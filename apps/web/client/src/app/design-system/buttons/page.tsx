import { Button } from '@repo/ui/components/button'

import { buttonVariants, colors } from '../_lib/shared'

export default function ButtonsPage() {
  return (
    <div className="flex flex-col gap-4 py-8">
      {buttonVariants.map((variant) => (
        <div key={variant} className="flex flex-wrap items-center gap-2">
          <span className="label-small text-text-secondary w-20 shrink-0 capitalize">
            {variant}
          </span>
          {colors.map((color) => (
            <Button key={color} variant={variant} color={color}>
              {color}
            </Button>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <span className="label-small text-text-secondary w-20 shrink-0">
          Sizes
        </span>
        <Button size="xs">xs</Button>
        <Button size="sm">sm</Button>
        <Button size="default">default</Button>
        <Button size="lg">lg</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <span className="label-small text-text-secondary w-20 shrink-0">
          Disabled
        </span>
        <Button disabled>default</Button>
        <Button variant="outline" disabled>
          outline
        </Button>
        <Button color="error" disabled>
          error
        </Button>
      </div>
    </div>
  )
}
