'use client'

import { Loader2, Plus } from 'lucide-react'
import { useState, useTransition } from 'react'

import { quickAddTask } from '../../app/(signed-in)/(org)/projects/[projectId]/actions'

/**
 * A title and Enter, and the task exists.
 *
 * 🟡 Amber in the roadmap and explicitly not cuttable: quick add is what makes
 * people come back to a tracker. So nothing else is asked for — the status
 * comes from the project's default column and the position from the end of it
 * — and the box stays focused with its text cleared, because the interaction
 * people actually perform is typing four of these in a row.
 *
 * One row and **no button**, which is the shape the design asks for and the
 * one that earns the feature its name: a button invites a pointer, and the
 * whole point is that a hand never leaves the keyboard. Enter submits, and the
 * row says where the task will land so that nobody has to guess which column
 * they just added to.
 *
 * Project screens only. My Tasks has no quick add and should not grow one:
 * a task has to be *in* a project, and a screen that spans them has no answer
 * to which. (If it ever does, the spec says remember the last one in
 * `localStorage` rather than adding a preferences table for it.)
 */
export function QuickAdd({
  projectId,
  projectName,
  defaultStatusName,
}: {
  projectId: string
  projectName: string
  /** The column new tasks land in, named so the row can say so. */
  defaultStatusName: string | null
}) {
  const [title, setTitle] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const typed = title.trim()
    if (typed === '') return

    setFailure(null)
    startTransition(async () => {
      const result = await quickAddTask(projectId, typed)

      if (!result.ok) {
        setFailure(result.message)

        return
      }

      // Nothing else to do: the action revalidated this path, so the reply to
      // it carries the re-rendered page and the list below adopts it. A
      // `router.refresh()` here as well was a second round trip for the same
      // answer — and the server is the one that decides which column the task
      // lands in and where in that column, so guessing on this side would put
      // the row in the wrong place until the next load.
      setTitle('')
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="border-divider bg-paper-elevation-0 focus-within:border-primary-outlined-border flex h-9.5 items-center gap-2.5 rounded-lg border px-3">
        {pending ? (
          <Loader2 className="text-primary-main size-4 shrink-0 animate-spin" />
        ) : (
          <Plus className="text-primary-main size-4 shrink-0" />
        )}

        <input
          value={title}
          disabled={pending}
          className="text-text-primary placeholder:text-text-disabled body-1 h-full min-w-0 flex-1 bg-transparent outline-none"
          placeholder={`Add a task to ${projectName} — press Enter`}
          aria-label="New task title"
          onChange={(event) => setTitle(event.target.value)}
        />

        {defaultStatusName !== null && (
          <span className="text-text-disabled body-3 hidden shrink-0 sm:block">
            Goes to {defaultStatusName}
          </span>
        )}
      </div>

      {failure !== null && (
        <p className="text-error-main body-3" role="alert">
          {failure}
        </p>
      )}
    </form>
  )
}
