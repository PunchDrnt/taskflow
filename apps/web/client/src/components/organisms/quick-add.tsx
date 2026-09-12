'use client'

import { Plus } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'

import { quickAddTask } from '../../app/(signed-in)/projects/[projectId]/actions'

/**
 * A title and Enter, and the task exists.
 *
 * 🟡 Amber in the roadmap and explicitly not cuttable: quick add is what makes
 * people come back to a tracker. So nothing else is asked for — the status
 * comes from the project's default column and the position from the end of it
 * — and the box stays focused with its text cleared, because the interaction
 * people actually perform is typing four of these in a row.
 *
 * Project screens only. My Tasks has no quick add and should not grow one:
 * a task has to be *in* a project, and a screen that spans them has no answer
 * to which. (If it ever does, the spec says remember the last one in
 * `localStorage` rather than adding a preferences table for it.)
 */
export function QuickAdd({ projectId }: { projectId: string }) {
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
      <div className="flex items-center gap-2">
        <Input
          value={title}
          disabled={pending}
          placeholder="Add a task and press Enter"
          aria-label="New task title"
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button
          type="submit"
          color="primary"
          disabled={pending || title.trim() === ''}
        >
          <Plus />
          Add
        </Button>
      </div>

      {failure !== null && (
        <p className="text-error-main body-3" role="alert">
          {failure}
        </p>
      )}
    </form>
  )
}
