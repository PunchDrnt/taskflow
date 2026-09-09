/**
 * One summary number.
 *
 * `capped` renders `100+` rather than a figure that would be wrong: Home reads
 * one page of work, so past that limit it knows there is more without knowing
 * how much. Saying so is cheaper than a count endpoint and more honest than a
 * number that quietly stops rising.
 */
export function Stat({
  label,
  value,
  capped = false,
  tone = 'default',
}: {
  label: string
  value: number
  capped?: boolean
  tone?: 'default' | 'urgent'
}) {
  return (
    <div className="bg-default border-default flex flex-col gap-1 rounded-lg border p-4">
      <span
        className={`text-headline-sm font-bold tabular-nums ${
          tone === 'urgent' && value > 0
            ? 'text-error-main'
            : 'text-text-primary'
        }`}
      >
        {value}
        {capped && '+'}
      </span>
      <span className="text-text-secondary text-xs">{label}</span>
    </div>
  )
}
