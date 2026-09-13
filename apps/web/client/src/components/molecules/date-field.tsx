'use client'

import { CalendarDays } from 'lucide-react'

import { Button } from '@repo/ui/components/button'
import { Calendar } from '@repo/ui/components/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@repo/ui/components/popover'

/**
 * Picking a day, using the design system's calendar rather than the browser's.
 *
 * `<input type="date">` looks like whatever Chrome, Safari and Firefox each
 * decided — three different controls inside one screen that is otherwise ours,
 * and none of them themeable. `@repo/ui` ships a `Calendar`; this is the two
 * lines of glue that make it a field.
 *
 * ⚠️ **The value is a calendar day, not an instant**, so it is carried as
 * `YYYY-MM-DD` and converted through the *local* parts of a `Date`. Going via
 * `new Date('2026-09-13')` would read it as UTC midnight and hand back the
 * 12th to anybody west of Greenwich — the one bug this component exists to
 * not have.
 */
export function DateField({
  value,
  onChange,
  label,
  min,
  max,
}: {
  /** `YYYY-MM-DD`, or `''` for no day chosen. */
  value: string
  onChange: (value: string) => void
  /** Names the control for a screen reader; the button shows the date. */
  label: string
  min?: string
  max?: string
}) {
  const selected = toDate(value)

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            // Neutral, not primary: this is an empty field waiting for input,
            // and an accent outline around one makes the panel read as four
            // things to press rather than one.
            color="neutral"
            size="sm"
            aria-label={label}
            className="w-full justify-start font-normal"
          >
            <CalendarDays />
            {value === '' ? (
              <span className="text-text-disabled">Any</span>
            ) : (
              <span className="tabular-nums">{value}</span>
            )}
          </Button>
        }
      />

      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          autoFocus
          selected={selected}
          defaultMonth={selected}
          disabled={outside(min, max)}
          // Picking the selected day again clears it, which is the only way
          // back to "any day" once one is set.
          onSelect={(day) => onChange(day === undefined ? '' : toValue(day))}
        />
      </PopoverContent>
    </Popover>
  )
}

/** The days the calendar must refuse — one matcher per end that was given. */
function outside(min: string | undefined, max: string | undefined) {
  const before = toDate(min ?? '')
  const after = toDate(max ?? '')

  return [
    ...(before === undefined ? [] : [{ before }]),
    ...(after === undefined ? [] : [{ after }]),
  ]
}

function toDate(value: string): Date | undefined {
  const [year, month, day] = value.split('-').map(Number)

  return year === undefined || month === undefined || day === undefined
    ? undefined
    : new Date(year, month - 1, day)
}

function toValue(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
