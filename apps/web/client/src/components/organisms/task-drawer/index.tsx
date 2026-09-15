import { ChevronsRight, History, Maximize2, Minimize2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import type { TaskRow } from '@repo/shared'
import { Button } from '@repo/ui/components/button'
import { Sheet, SheetContent, SheetTitle } from '@repo/ui/components/sheet'
import { Spinner } from '@repo/ui/components/spinner'

import { editTask } from '@/app/(signed-in)/task-actions'
import { ProjectDot } from '@/components/atoms/project-dot'
import { StatusBadge } from '@/components/atoms/status-badge'
import { TaskKey } from '@/components/atoms/task-key'
import { DateField } from '@/components/molecules/date-field'
import { StatusPicker } from '@/components/molecules/status-picker'
import { AssigneePicker } from '@/components/organisms/assignee-picker'
import {
  dueBucket,
  endOfDay,
  formatDay,
  formatTimeOfDay,
  toCalendarDay,
} from '@/lib/format/due-date'
import type { OpenTask, TaskDetail, TaskPatch } from '@/lib/tasks/task-detail'

import { namesFrom, TaskActivity } from './activity'
import {
  EditableDescription,
  EditableTitle,
  MetaRow,
  PriorityPicker,
} from './fields'

/**
 * One task, opened over the list it was clicked in.
 *
 * A drawer rather than a page, which is what the design draws and what the
 * work is actually like: people move down a list opening one task after
 * another, and a page makes each of those a navigation away from the place
 * they are working. The list stays where it was, scrolled where it was, with
 * everything Load more added still in it.
 *
 * **This is the only screen a task can be edited from**, which is why the
 * title and the description are editable in place — docs/04-features/phase-1.md
 * asks for CRUD on both and the list has room for neither.
 *
 * The pickers are the same components the list's cells use, with one
 * difference worth naming: **status and assignee are editable here even on My
 * Tasks.** The columns keep them read-only there because a list spanning
 * projects has no single board to offer and no project to check membership
 * against — a drawer has exactly one of each, so the reason does not apply.
 *
 * What the design has and Phase 1 does not: sub-tasks and a sprint row (Phase
 * 2), a comment composer (Phase 2 — see `TaskActivity`), and a "Created by"
 * row, which `TaskRow` cannot answer because the API does not send the
 * creator. The feed's last line says who created it, which is the truthful
 * version of the same fact.
 */
export function TaskDrawer({
  open,
  onClose,
  onTaskChanged,
}: {
  /**
   * The task to draw, or null for none.
   *
   * Its `detail` may be **provisional** — the task, its project and the one
   * status it is in, all of which the clicked row already knew — so the panel
   * opens on the spot rather than on a spinner, and is replaced when the board
   * and the feed arrive.
   */
  open: OpenTask | null
  onClose: () => void
  /** An edit made here is a row the list behind is also showing. */
  onTaskChanged: (task: TaskRow) => void
}) {
  /**
   * The last task that was open, kept so there is something to draw while the
   * panel slides out.
   */
  const [held, setHeld] = useState(open)

  if (open !== null && open !== held) setHeld(open)

  const showing = open ?? held
  const detail = showing?.detail ?? null

  return (
    <Sheet
      open={open !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      {showing !== null && detail !== null && (
        <TaskPanel
          taskId={showing.taskId}
          detail={detail}
          loading={showing.loading}
          failure={showing.failure}
          onClose={onClose}
          onTaskChanged={onTaskChanged}
        />
      )}
    </Sheet>
  )
}

/**
 * The panel itself — split from the dialog around it, and not for tidiness.
 *
 * ⚠️ **`Sheet` has to be mounted *before* the task is, or nothing animates.**
 * base-ui's `useTransitionStatus` lives in `Dialog.Root` and starts `mounted`
 * at whatever `open` is, so a root that first appears already open never gets
 * `data-starting-style` and never slides in; unmounting it to close skips
 * `data-ending-style` the same way. The root above therefore renders from the
 * first paint with `open` false, and this — which needs a task to draw at all
 * — is what comes and goes inside it.
 *
 * Its own state outlives the task it was opened for, which is deliberate: how
 * wide the panel is and whether the history is out are preferences, and
 * re-deciding them on every task is the thing that would annoy. The one
 * exception is a failed edit, which belongs to the task it happened on.
 */
function TaskPanel({
  taskId,
  detail,
  loading,
  failure,
  onClose,
  onTaskChanged,
}: {
  taskId: string
  detail: TaskDetail
  /** True while `detail` is the provisional version. */
  loading: boolean
  /** Why the rest never arrived, if it did not. */
  failure: string | null
  onClose: () => void
  onTaskChanged: (task: TaskRow) => void
}) {
  const [expanded, setExpanded] = useState(false)
  // Shut to begin with, as in the design: the fields are what somebody opened
  // a task for, and the history is what they go looking for afterwards.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [editFailure, setEditFailure] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [failedFor, setFailedFor] = useState(taskId)

  if (failedFor !== taskId) {
    setFailedFor(taskId)
    setEditFailure(null)
  }

  const { task, project, statuses, activity } = detail
  const status = statuses.find((one) => one.id === task.statusId) ?? null
  const names = namesFrom(activity, task.assignees)
  const overdue =
    task.completedAt === null && dueBucket(task.dueDate) === 'overdue'

  function edit(patch: TaskPatch) {
    setEditFailure(null)
    startTransition(async () => {
      const result = await editTask(task.id, patch)

      if (result.ok) onTaskChanged(result.task)
      else setEditFailure(result.message)
    })
  }

  return (
    <SheetContent
      side="right"
      showCloseButton={false}
      // The width is the design's: 720px, 1060 with the history panel out,
      // and the whole window when expanded. Every override repeats
      // `data-[side=right]:`, which is what lets `cn` recognise it as the
      // same utility and drop `SheetContent`'s own — a bare `w-full` would
      // leave two width rules and let stylesheet order decide.
      className={`gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-none ${
        expanded
          ? ''
          : historyOpen
            ? 'data-[side=right]:lg:w-265'
            : 'data-[side=right]:lg:w-180'
      }`}
    >
      <header className="border-divider flex shrink-0 items-center gap-1.5 border-b px-3 py-2">
        <Button
          variant="ghost"
          color="neutral"
          size="icon-sm"
          aria-label="Close"
          onClick={onClose}
        >
          <ChevronsRight />
        </Button>

        <Button
          variant="ghost"
          color="neutral"
          size="icon-sm"
          aria-label={expanded ? 'Collapse to a drawer' : 'Expand'}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <Minimize2 /> : <Maximize2 />}
        </Button>

        {/* Where this task lives, for somebody who opened it from My Tasks
              and has four boards in their head. */}
        <p className="text-text-secondary body-3 flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate">{project?.name ?? '—'}</span>
          <TaskKey>{task.key}</TaskKey>
        </p>

        <Button
          variant={historyOpen ? 'secondary' : 'ghost'}
          color={historyOpen ? 'primary' : 'neutral'}
          size="sm"
          aria-pressed={historyOpen}
          onClick={() => setHistoryOpen(!historyOpen)}
        >
          <History />
          {loading ? '' : activity.length}
          <span className="sr-only">Activity</span>
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-start lg:flex-row">
        <div className="flex flex-1 justify-center overflow-y-auto px-6 py-6 sm:px-8">
          <div
            className={`flex w-full flex-col ${expanded ? 'max-w-215' : ''}`}
          >
            {/* The dialog takes its accessible name from this heading, so
                  there is one title rather than a visible one and a hidden
                  one that drift apart. */}
            <SheetTitle render={<h2 className="mb-2.5" />}>
              <EditableTitle
                title={task.title}
                pending={pending}
                onSave={(title) => edit({ title })}
              />
            </SheetTitle>

            <EditableDescription
              description={task.description}
              pending={pending}
              onSave={(description) => edit({ description })}
            />

            {editFailure !== null && (
              <p className="text-error-main body-3 mt-3" role="alert">
                {editFailure}
              </p>
            )}

            <div className="mt-6 flex flex-col">
              <MetaRow label="Status">
                {status === null ? (
                  <Dash />
                ) : loading ? (
                  // The board is not known yet, and a picker offering the
                  // one column already in view would be a control that
                  // cannot change anything.
                  <StatusBadge status={status} />
                ) : (
                  <StatusPicker
                    taskId={task.id}
                    status={status}
                    statuses={statuses}
                    onTaskChanged={onTaskChanged}
                  />
                )}
              </MetaRow>

              <MetaRow label="Assignee">
                <AssigneePicker
                  projectId={task.projectId}
                  taskId={task.id}
                  assignees={task.assignees}
                  onAssigneesChanged={(assignees) =>
                    onTaskChanged({ ...task, assignees })
                  }
                />
              </MetaRow>

              <MetaRow label="Due date">
                <DateField
                  variant="ghost"
                  label="Due date"
                  placeholder="No due date"
                  className={`-mx-1.5 w-auto px-1.5 ${overdue ? 'text-error-main' : ''}`}
                  value={
                    task.dueDate === null ? '' : toCalendarDay(task.dueDate)
                  }
                  // 🔒 A day picked here becomes the **last** instant of
                  // that day in the company's zone. "Due on the 30th" is
                  // not late at breakfast on the 30th, which is what
                  // midnight would make it — and the API refuses a date
                  // with no offset at all (`dueDateSchema`).
                  onChange={(day) =>
                    edit({ dueDate: day === '' ? null : endOfDay(day) })
                  }
                />
              </MetaRow>

              <MetaRow label="Priority">
                <PriorityPicker
                  priority={task.priority}
                  pending={pending}
                  onChange={(priority) => edit({ priority })}
                />
              </MetaRow>

              <MetaRow label="Project">
                {project === null ? (
                  <Dash />
                ) : (
                  <span className="text-text-primary body-2 flex items-center gap-1.5">
                    <ProjectDot color={project.color} />
                    {project.name}
                  </span>
                )}
              </MetaRow>
            </div>

            {task.completedAt !== null && (
              <p className="border-success-outlined-border bg-success-soft text-success-light body-3 mt-4 rounded-md border px-3 py-2">
                Completed
                {task.completedBy !== null &&
                  names.has(task.completedBy) &&
                  ` by ${names.get(task.completedBy)}`}{' '}
                · {formatDay(task.completedAt)} at{' '}
                {formatTimeOfDay(task.completedAt)}
              </p>
            )}

            {failure !== null && (
              <p className="text-warning-main body-3 mt-4" role="alert">
                {failure}
              </p>
            )}
          </div>
        </div>

        {historyOpen && (
          <aside className="border-divider bg-paper-elevation-0 flex min-h-0 w-full shrink-0 flex-col border-t lg:w-85 lg:border-t-0 lg:border-l">
            <header className="border-divider flex h-10 shrink-0 items-center gap-2 border-b px-4">
              <h3 className="subtitle-4 text-text-primary flex-1">Activity</h3>
              {!loading && (
                <span className="text-text-disabled body-3 font-mono">
                  {activity.length}
                </span>
              )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-6">
                  <Spinner className="text-text-disabled" />
                </div>
              ) : (
                /* The log as it stood when the drawer opened. An edit made
                     here does not add a line: re-reading the whole history
                     after every field change is a request per change, for a
                     sentence describing what the person just did in front of
                     it. Re-opening the task shows it. */
                <TaskActivity
                  entries={activity}
                  statuses={statuses}
                  assignees={task.assignees}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </SheetContent>
  )
}

/** The same "nothing here, and not an error" the list's cells draw. */
function Dash() {
  return <span className="text-text-disabled body-3">—</span>
}
