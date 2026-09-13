import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The type scale this theme actually has, told to tailwind-merge.
 *
 * ⚠️ **Without this, a size and a colour cannot coexist on one element.**
 * `theme.css` sets `--text-*: initial`, which deletes Tailwind's own scale, so
 * none of `text-xs … text-9xl` exists here and none of the sixteen names below
 * is known to tailwind-merge. Anything shaped `text-<something>` it does not
 * recognise falls through to the *colour* group — so `text-body-md` and
 * `text-text-secondary` looked like two colours, and the later one silently
 * deleted the earlier.
 *
 * Measured, and it is why this file changed: `SidebarMenuButton` carries
 * `text-body-md` in its size variant, which comes after the base string, so
 * every colour the base tried to set was dropped and the sidebar's links fell
 * back to the `a { color: var(--color-primary-main) }` in `@layer base` — a
 * navigation column rendered entirely in the accent colour. The same trap was
 * waiting for every other component that pairs a size with a colour.
 *
 * `extend` rather than `override`: the defaults carry the arbitrary-value
 * validators (`text-[13px]`), and the built-in names they also match are
 * classes this theme cannot produce anyway.
 */
const FONT_SIZES = [
  'display-lg',
  'display-md',
  'display-sm',
  'headline-lg',
  'headline-md',
  'headline-sm',
  'title-lg',
  'title-md',
  'title-sm',
  'title-xs',
  'body-lg',
  'body-md',
  'body-sm',
  'label-lg',
  'label-md',
  'label-sm',
]

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: FONT_SIZES }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
