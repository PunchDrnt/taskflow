'use client'

import { Loader2, Search, UserPlus, X } from 'lucide-react'
import { useRef, useState, useTransition } from 'react'

import type { AssignableRow, AssigneeRow } from '@repo/shared'
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@repo/ui/components/popover'

import {
  assignTask,
  searchAssignable,
  unassignTask,
} from '../../app/(signed-in)/projects/[projectId]/actions'
import { AssigneeStack } from '../molecules/assignee-stack'

/**
 * Who is doing this, chosen by typing.
 *
 * 🟡 A type-ahead and not a dropdown of everybody, which the spec is explicit
 * about: a hundred-person company gives a list nobody scrolls. It searches the
 * formal name, the nickname and the email, because Thai colleagues go by their
 * nickname and a directory keyed on formal names is one people cannot use.
 *
 * Every row shows both names and the email. That is not decoration either —
 * repeated first names and repeated nicknames are certain at this size, and
 * the failure this prevents is giving work to the wrong Pim.
 *
 * 🔒 **Picking somebody outside the project asks first.** The API refuses with
 * `NOT_PROJECT_MEMBER`, and the confirmation is a second request rather than a
 * hidden write, because joining somebody to a project hands them everything in
 * it. The button below says exactly that before it is pressed.
 */
export function AssigneePicker({
  projectId,
  taskId,
  assignees,
  onAssigneesChanged,
}: {
  projectId: string
  taskId: string
  assignees: AssigneeRow[]
  onAssigneesChanged: (assignees: AssigneeRow[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [wholeOrg, setWholeOrg] = useState(false)
  const [people, setPeople] = useState<AssignableRow[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<AssignableRow | null>(null)
  const [pending, startTransition] = useTransition()

  /**
   * Which search the newest answer belongs to.
   *
   * No debounce timer, deliberately: a timer means `setState` from inside an
   * effect, and the useful part of debouncing here is not sending fewer
   * requests — the list is capped at twenty rows for a company of a hundred —
   * but never drawing an older answer over a newer one. A sequence number does
   * that exactly, and does it for the case a timer cannot cover anyway, where
   * two in-flight requests come back out of order.
   */
  const latest = useRef(0)

  function look(next: string, scope: 'project' | 'org') {
    const mine = (latest.current += 1)

    startTransition(async () => {
      const found = await searchAssignable(projectId, next, scope)

      if (mine !== latest.current) return

      if (!found.ok) {
        setFailure(found.message)

        return
      }

      setFailure(null)
      setPeople(found.people)
    })
  }

  function openWith(next: boolean) {
    setOpen(next)

    if (next) {
      setConfirming(null)
      look(query, wholeOrg ? 'org' : 'project')
    }
  }

  function apply(
    run: () => Promise<
      | { ok: true; assignees: AssigneeRow[] }
      | {
          ok: false
          kind: 'needs-project-membership' | 'failed'
          message: string
        }
    >,
    person: AssignableRow | null,
  ) {
    setFailure(null)
    startTransition(async () => {
      const result = await run()

      if (result.ok) {
        setConfirming(null)
        onAssigneesChanged(result.assignees)

        return
      }

      if (result.kind === 'needs-project-membership' && person !== null) {
        setConfirming(person)

        return
      }

      setFailure(result.message)
    })
  }

  const held = new Set(assignees.map((person) => person.userId))

  return (
    <Popover open={open} onOpenChange={openWith}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="hover:bg-action-hover -mx-1 rounded-md px-1 py-0.5"
            aria-label="Change who has this task"
          />
        }
      >
        <AssigneeStack assignees={assignees} />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-divider flex items-center gap-2 border-b px-3 py-2">
          <Search className="text-text-disabled size-4 shrink-0" />
          <Input
            autoFocus
            value={query}
            placeholder="Name, nickname or email"
            className="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
            onChange={(event) => {
              setQuery(event.target.value)
              look(event.target.value, wholeOrg ? 'org' : 'project')
            }}
          />
          {pending && (
            <Loader2 className="text-text-disabled size-4 animate-spin" />
          )}
        </div>

        {failure !== null && (
          <p className="text-error-main body-3 px-3 py-2" role="alert">
            {failure}
          </p>
        )}

        {confirming !== null ? (
          <Confirm
            person={confirming}
            pending={pending}
            onCancel={() => setConfirming(null)}
            onConfirm={() =>
              apply(() => assignTask(taskId, confirming.userId, true), null)
            }
          />
        ) : (
          <ul className="max-h-64 overflow-y-auto py-1">
            {people.length === 0 && !pending && (
              <li className="text-text-disabled body-3 px-3 py-4 text-center">
                Nobody matches that.
              </li>
            )}

            {people.map((person) => (
              <li key={person.userId}>
                <PersonRow
                  person={person}
                  assigned={held.has(person.userId)}
                  onPick={() =>
                    apply(
                      () =>
                        held.has(person.userId)
                          ? unassignTask(taskId, person.userId)
                          : assignTask(taskId, person.userId),
                      person,
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {!wholeOrg && confirming === null && (
          <div className="border-divider border-t p-1">
            <Button
              variant="ghost"
              color="primary"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setWholeOrg(true)
                look(query, 'org')
              }}
            >
              <UserPlus />
              Search the whole organisation
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function PersonRow({
  person,
  assigned,
  onPick,
}: {
  person: AssignableRow
  assigned: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="hover:bg-action-hover flex w-full items-center gap-2 px-3 py-1.5 text-left"
    >
      <Avatar size="sm">
        {person.avatarUrl !== null && (
          <AvatarImage src={person.avatarUrl} alt={person.nickname} />
        )}
        <AvatarFallback>{[...person.nickname][0] ?? '?'}</AvatarFallback>
      </Avatar>

      <span className="min-w-0 flex-1">
        <span className="text-text-primary body-2 block truncate">
          {person.nickname}{' '}
          <span className="text-text-secondary">({person.name})</span>
        </span>
        <span className="text-text-disabled body-3 block truncate">
          {person.email}
        </span>
      </span>

      {!person.inProject && (
        <span className="text-text-disabled body-3 shrink-0">
          not in project
        </span>
      )}
      {assigned && <X className="text-text-secondary size-4 shrink-0" />}
    </button>
  )
}

/** The question the API asked, put to the person who can answer it. */
function Confirm({
  person,
  pending,
  onCancel,
  onConfirm,
}: {
  person: AssignableRow
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-text-secondary body-2">
        <span className="text-text-primary font-medium">{person.nickname}</span>{' '}
        is not in this project. Adding them gives them every task, comment and
        attachment in it.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" color="primary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          color="primary"
          size="sm"
          disabled={pending}
          onClick={onConfirm}
        >
          Add and assign
        </Button>
      </div>
    </div>
  )
}
