import type { TaskPriority } from '@repo/shared'

/**
 * How urgent a task is, as a word in a colour.
 *
 * The semantic tokens rather than the eight-colour palette: urgency is one of
 * the things the theme already has an opinion about, and borrowing `error` for
 * "urgent" means an urgent task and a failed request agree about what red
 * means. The palette is for things a person chose the colour of — projects and
 * statuses — which priority is not.
 *
 * The word carries the meaning; the colour only makes it findable. `low` is
 * deliberately not coloured at all, because a list where every row shouts has
 * nothing left to shout with.
 */
const TONE: Record<TaskPriority, string> = {
  urgent: 'text-error-main font-medium',
  high: 'text-warning-main',
  medium: 'text-text-secondary',
  low: 'text-text-disabled',
}

const LABEL: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export function PriorityTag({ priority }: { priority: TaskPriority }) {
  return <span className={`body-3 ${TONE[priority]}`}>{LABEL[priority]}</span>
}
