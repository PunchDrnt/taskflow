'use client'

import { Check } from 'lucide-react'
import { useId } from 'react'

import { STATUS_COLORS, type StatusColor } from '@repo/shared'

/**
 * The eight-colour palette, as a set of radio inputs.
 *
 * 🔒 **Tokens, never hex.** `paletteColorSchema` reads the same eight as a
 * status does, so a colour a project can wear is always one a status can wear
 * too, and the whole product re-themes by editing `theme.css` rather than by
 * migrating rows.
 *
 * Real `<input type="radio">` elements, styled through `peer-checked`, rather
 * than buttons with state: the value then reaches a Server Action through
 * `FormData` with no JavaScript involved in carrying it, and arrow-key
 * navigation, form reset and `required` all come from the browser rather than
 * from something re-implemented here.
 *
 * The tick is drawn on the selected swatch because colour alone cannot say
 * which is chosen to somebody who cannot separate two of them — the same
 * reason the status badge always carries its name.
 */
export function PaletteField({
  name,
  defaultValue = 'blue',
  label = 'Colour',
}: {
  name: string
  defaultValue?: StatusColor
  label?: string
}) {
  const group = useId()

  return (
    <fieldset>
      <legend className="label-medium text-text-secondary mb-2">{label}</legend>

      <div className="flex flex-wrap gap-2">
        {STATUS_COLORS.map((color) => (
          <label
            key={color}
            htmlFor={`${group}-${color}`}
            className="cursor-pointer"
          >
            <span className="sr-only">{color}</span>
            <input
              id={`${group}-${color}`}
              type="radio"
              name={name}
              value={color}
              defaultChecked={color === defaultValue}
              className="peer sr-only"
            />
            <span
              // `peer-checked:*:` and not `peer-checked:` on the icon
              // itself: the icon is a *descendant* of this span, and a peer
              // variant only reaches the sibling it is written on.
              className="ring-divider peer-focus-visible:ring-primary-focus-visible peer-checked:ring-text-primary flex size-7 items-center justify-center rounded-full ring-1 transition-all peer-checked:ring-2 peer-checked:*:opacity-100 peer-focus-visible:ring-3"
              style={{ backgroundColor: `var(--color-status-${color}-main)` }}
            >
              <Check className="text-default size-4 opacity-0" />
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
