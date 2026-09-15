import { Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@repo/ui/components/alert-dialog'
import { Button } from '@repo/ui/components/button'
import { Spinner } from '@repo/ui/components/spinner'

import { deleteTask } from '@/app/(signed-in)/task-actions'

/**
 * Throwing a task away, from the one screen that has the whole of it.
 *
 * **Not in the design**, which draws a drawer with no such control — so this
 * is an addition rather than an implementation, and the shape of it is the
 * argument for why it is safe to add. `DELETE /v1/tasks/:taskId` has existed
 * since the API was written; what was missing was anywhere to press.
 *
 * Who sees it is decided by the caller, from `project.role`, and it matches
 * what `ability.ts` will actually allow: a project **admin**, or somebody who
 * runs the organisation. A member may create and edit tasks and may not delete
 * them, so drawing this for them would be a button whose only outcome is a
 * 403 — the API still refuses, but a control that exists to fail is a worse
 * answer than a control that is not there.
 *
 * The confirmation says the two things that cannot be taken back, because a
 * dialog that only asks "are you sure?" is a dialog people learn to click
 * through. It owns the request itself, the way `StatusPicker` does: the drawer
 * hands it an id and hears back that the task is gone.
 */
export function DeleteTask({
  taskId,
  taskKey,
  onDeleted,
}: {
  taskId: string
  /** `DEV-120` — named in the question, so nobody confirms the wrong task. */
  taskKey: string
  onDeleted: (taskId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function confirm() {
    setFailure(null)
    startTransition(async () => {
      const result = await deleteTask(taskId)

      if (!result.ok) {
        setFailure(result.message)

        return
      }

      // Closed here rather than by the dialog's own dismissal, so a failure
      // leaves it open with the reason in it instead of vanishing and taking
      // the explanation with it.
      setOpen(false)
      onDeleted(taskId)
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // A request is in flight; the panel behind is about to disappear.
        if (pending) return

        setOpen(next)
        if (!next) setFailure(null)
      }}
    >
      {/* A trigger rather than a button that sets the state, so focus comes
          back to it when the dialog is dismissed. */}
      <AlertDialogTrigger
        render={<Button variant="ghost" color="error" size="icon-sm" />}
        aria-label="Delete task"
      >
        <Trash2 />
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {taskKey}?</AlertDialogTitle>
          <AlertDialogDescription>
            Everything under it goes too — sub-tasks, comments and attachments.
            And {taskKey} is never issued again: the number stays spent, so a
            link to it in an old thread leads nowhere rather than to a different
            task.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {failure !== null && (
          <p className="text-error-main body-3" role="alert">
            {failure}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel
            render={<Button variant="outline" disabled={pending} />}
          >
            Cancel
          </AlertDialogCancel>
          {/* Not a `Close`, deliberately — unlike Cancel beside it. The
              dialog stays up until the API has answered, so a refusal has
              somewhere to be read. */}
          <AlertDialogAction color="error" disabled={pending} onClick={confirm}>
            {pending && <Spinner />}
            Delete task
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
