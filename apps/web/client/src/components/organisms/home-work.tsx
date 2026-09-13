'use client'

import Link from 'next/link'
import { useState } from 'react'

import type { MyWorkRow } from '@repo/shared'

import { dueBucket } from '../../lib/format/due-date'
import { WorkRow } from '../molecules/work-row'

type Bucket = 'open' | 'overdue' | 'week'

const LABELS: Record<Bucket, string> = {
  open: 'Open',
  overdue: 'Overdue',
  week: 'Due this week',
}

/**
 * What is on somebody's plate, with the three counters that filter it.
 *
 * The counters are the filter rather than decoration above one: "how many are
 * late" and "show me the late ones" are the same question asked twice, and a
 * number nobody can press is a number people go looking for a list to match.
 *
 * The selection stays here rather than in the URL, which is the opposite of
 * what the task lists do — deliberately. A filtered task list is a link worth
 * sending to a colleague; "my overdue work" is not something anyone else can
 * open, so putting it in the URL would buy a shareable link to an empty page.
 *
 * `now` is captured once per render rather than per row, so a list crossing
 * midnight cannot sort one task by yesterday and the next by today.
 */
export function HomeWork({
  rows,
  capped,
}: {
  rows: MyWorkRow[]
  /** More than one page existed, so "open" reads as `n+` instead of `n`. */
  capped: boolean
}) {
  const [bucket, setBucket] = useState<Bucket>('open')
  const now = new Date()

  const overdue = rows.filter(
    (row) => dueBucket(row.dueDate, now) === 'overdue',
  )
  const week = rows.filter((row) =>
    ['today', 'soon'].includes(dueBucket(row.dueDate, now)),
  )

  const counts: Record<Bucket, number> = {
    open: rows.length,
    overdue: overdue.length,
    week: week.length,
  }
  const lists: Record<Bucket, MyWorkRow[]> = { open: rows, overdue, week }
  const shown = lists[bucket]

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-3">
        {(['open', 'overdue', 'week'] as const).map((one) => (
          <Counter
            key={one}
            label={LABELS[one]}
            count={counts[one]}
            // Only the total is capped: the page is ordered by due date, so
            // everything overdue and everything due this week is inside the
            // first hundred rows whenever the hundredth is further away.
            capped={capped && one === 'open'}
            urgent={one === 'overdue'}
            selected={bucket === one}
            onSelect={() => setBucket(one)}
          />
        ))}
      </div>

      <section className="bg-paper-elevation-0 border-divider overflow-hidden rounded-lg border">
        <div className="border-divider-soft flex items-center justify-between gap-4 border-b px-4 py-3">
          <h2 className="subtitle-3">{LABELS[bucket]}</h2>
          <Link
            href="/my-tasks"
            className="text-text-secondary body-3 hover:text-primary-light"
          >
            All my tasks →
          </Link>
        </div>

        {shown.length === 0 ? (
          <p className="text-text-secondary body-2 px-4 py-10 text-center">
            {bucket === 'open'
              ? 'Nothing is assigned to you. Work given to you shows up here, soonest deadline first.'
              : 'Nothing in this bucket right now.'}
          </p>
        ) : (
          <ul>
            {shown.map((task) => (
              <WorkRow
                key={task.id}
                task={task}
                overdue={dueBucket(task.dueDate, now) === 'overdue'}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Counter({
  label,
  count,
  capped,
  urgent,
  selected,
  onSelect,
}: {
  label: string
  count: number
  capped: boolean
  urgent: boolean
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors ${
        selected
          ? 'border-primary-outlined-border bg-primary-soft'
          : 'border-divider bg-paper-elevation-0 hover:bg-action-hover'
      }`}
    >
      <span
        className={`h5 tabular-nums ${
          urgent && count > 0 ? 'text-error-main' : 'text-text-primary'
        }`}
      >
        {count}
        {capped && '+'}
      </span>
      <span className="text-text-secondary body-3">{label}</span>
    </button>
  )
}
