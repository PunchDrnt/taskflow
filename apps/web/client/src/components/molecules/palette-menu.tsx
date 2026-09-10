'use client'

import { Check } from 'lucide-react'

import { STATUS_COLORS, type StatusColor } from '@repo/shared'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu'

/**
 * The eight palette colours, for picking one in place.
 *
 * The sibling of `PaletteField`, which is the same eight as radio inputs in a
 * form. Two components rather than one because they are answering in different
 * grammars: a form collects a value and submits it, a settings row *is* the
 * stored value and writes on the click. Sharing one would mean a hidden input
 * nobody submits, or a form wrapped around a table row.
 *
 * ⚠️ `DropdownMenuLabel` is Base UI's `Menu.GroupLabel` and throws outside a
 * `Menu.Group` — hence the group around the swatches.
 */
export function PaletteMenu({
  value,
  disabled = false,
  onPick,
}: {
  value: StatusColor
  disabled?: boolean
  onPick: (color: StatusColor) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            aria-label={`Colour: ${value}`}
            className="ring-divider hover:ring-text-secondary size-6 shrink-0 rounded-full ring-1 disabled:opacity-50"
            style={{ backgroundColor: `var(--color-status-${value}-main)` }}
          />
        }
      />

      <DropdownMenuContent align="start" className="w-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Colour</DropdownMenuLabel>

          <div className="grid grid-cols-4 gap-1 p-1">
            {STATUS_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                onClick={() => onPick(color)}
                className="ring-divider hover:ring-text-primary flex size-7 items-center justify-center rounded-full ring-1"
                style={{ backgroundColor: `var(--color-status-${color}-main)` }}
              >
                {color === value && <Check className="text-default size-4" />}
              </button>
            ))}
          </div>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
