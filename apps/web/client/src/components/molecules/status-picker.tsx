'use client'

import { Check, ChevronDown } from 'lucide-react'
import { useState, useTransition } from 'react'

import type { StatusRow, TaskRow } from '@repo/shared'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@repo/ui/components/popover'

import { changeTaskStatus } from '@/app/(signed-in)/(org)/projects/[projectKey]/actions'

/**
 * The status badge, with the board's other columns behind it.
 *
 * Moving a task is the single most common edit in a tracker, and making it a
 * click on the thing already being read is what keeps the list usable without
 * a detail page. The badge keeps its name as well as its colour for the reason
 * `StatusBadge` gives: colour alone is not readable by everyone.
 *
 * Project screens only, like the assignee picker and for the same reason: a
 * status id belongs to one board, so a list spanning projects has no single
 * set of columns to offer. On My Tasks the badge stays a badge.
 *
 * The reply is the updated task, and it replaces the row rather than only its
 * status: the API stamps `completedAt` and `completedBy` when a task lands in
 * a column that counts as done, and a row patched with just the new id would
 * show the move while still claiming the task was never finished.
 */
export function StatusPicker({
  taskId,
  status,
  statuses,
  onTaskChanged,
}: {
  taskId: string
  /** The status the task is in now — already resolved by the caller. */
  status: StatusRow
  /** Every column on this board, in board order. */
  statuses: StatusRow[]
  onTaskChanged: (task: TaskRow) => void
}) {
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function choose(statusId: string) {
    setOpen(false)

    if (statusId === status.id) return

    setFailure(null)
    startTransition(async () => {
      const result = await changeTaskStatus(taskId, statusId)

      if (result.ok) onTaskChanged(result.task)
      else setFailure(result.message)
    })
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={pending}
          aria-label={`Status: ${status.name}. Change it.`}
          className="body-3 inline-flex w-fit items-center gap-1.5 rounded-4xl py-0.5 pr-1.5 pl-2 whitespace-nowrap hover:brightness-125 disabled:opacity-60"
          style={{
            backgroundColor: `var(--color-status-${status.color}-soft)`,
            color: `var(--color-status-${status.color}-text)`,
          }}
        >
          {status.name}
          <ChevronDown className="size-3 opacity-60" />
        </PopoverTrigger>

        {/* `gap-0`: `PopoverContent` is a flex column with `gap-2.5`, which
            is right for a panel of sections and wrong for a list of columns —
            it spaced five choices like five controls. Same metrics as the
            toolbar's Group panel and as `DropdownMenuItem`. */}
        <PopoverContent align="start" className="w-48 gap-0 p-1.5">
          {statuses.map((one) => (
            <button
              key={one.id}
              type="button"
              onClick={() => choose(one.id)}
              className="hover:bg-action-hover text-body-md flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: `var(--color-status-${one.color}-main)`,
                }}
              />
              <span className="flex-1 truncate">{one.name}</span>
              {one.id === status.id && (
                <Check className="text-primary-main size-3.5 shrink-0" />
              )}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Beside the badge rather than inside the menu: the menu is shut by the
          time an answer arrives, so a message in there is a message nobody
          reads. */}
      {failure !== null && (
        <span className="text-error-main body-3" role="alert" title={failure}>
          !
        </span>
      )}
    </span>
  )
}
