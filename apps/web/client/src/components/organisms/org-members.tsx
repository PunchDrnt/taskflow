'use client'

import { MoreHorizontal, Search } from 'lucide-react'
import { useState, useTransition } from 'react'

import { ORG_ROLES, type OrgMemberRow, type OrgRole } from '@repo/shared'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu'
import { Input } from '@repo/ui/components/input'

import {
  changeMemberRole,
  setMemberActive,
} from '@/app/(signed-in)/(org)/settings/organization/actions'
import { initialOf, UserAvatar } from '@/components/molecules/user-avatar'
import { AddMemberDialog } from '@/components/organisms/add-member-dialog'

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
}

/**
 * Everyone in the organisation, and the two things Phase 1 can do to them.
 *
 * Deactivated colleagues stay in this list. That is the whole difference
 * between switching an account off and removing somebody — removal is Phase 2
 * — and a list that hid them would answer "who is in this organisation" with
 * a different question.
 *
 * ⚠️ **The rules below are drawn here and enforced by the API**, not the other
 * way round. An admin may run the organisation's people but may neither
 * appoint an owner nor demote one; the last owner may be neither demoted nor
 * switched off; and an account belonging to more than one organisation cannot
 * be deactivated from here at all, because `iam.users.status` is account-level
 * and one company's admin would be locking somebody out of another's. Each of
 * those comes back as a message rather than being predicted — the last two
 * depend on rows this screen has not loaded.
 *
 * The design's Teams column is not here: teams have no endpoint in Phase 1, and
 * a column of dashes is a column that teaches people the feature is broken.
 */
export function OrgMembers({
  members,
  viewerRole,
  viewerId,
}: {
  members: OrgMemberRow[]
  /** Null while the caller has no role in this organisation. */
  viewerRole: OrgRole | null
  viewerId: string
}) {
  const [query, setQuery] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const matched = members.filter((member) => matches(member, query))
  const deactivated = members.filter((member) => !isActive(member))

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setFailure(null)
    startTransition(async () => {
      const result = await action()

      if (!result.ok) setFailure(result.message ?? 'That did not work.')
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="text-text-disabled pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            placeholder="Search members"
            aria-label="Search members"
            className="pl-8"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <span className="text-text-secondary body-3">
          {matched.length === members.length
            ? `${members.length} ${members.length === 1 ? 'member' : 'members'}`
            : `${matched.length} of ${members.length}`}
        </span>

        {viewerRole !== 'member' && viewerRole !== null && <AddMemberDialog />}
      </div>

      {failure !== null && (
        <p
          role="alert"
          className="border-error-main/30 bg-error-main/10 text-error-main body-2 rounded-md border px-3 py-2"
        >
          {failure}
        </p>
      )}

      <div className="bg-paper-elevation-0 border-divider overflow-hidden rounded-lg border">
        <div className="border-divider text-text-disabled overlined flex items-center gap-3 border-b px-4 py-2">
          <span className="flex-1">Member</span>
          <span className="w-24">Org role</span>
          <span className="w-28">Status</span>
          <span className="w-6" />
        </div>

        {matched.length === 0 && (
          <p className="text-text-secondary body-2 px-4 py-8 text-center">
            Nobody here matches that.
          </p>
        )}

        {matched.map((member) => {
          const active = isActive(member)

          return (
            <div
              key={member.userId}
              className="border-divider-soft hover:bg-action-hover flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <UserAvatar
                  size="sm"
                  userId={member.userId}
                  avatarUrl={member.avatarUrl}
                  fallback={initialOf(displayName(member))}
                  className={active ? '' : 'opacity-50'}
                />
                <div className="min-w-0">
                  <p
                    className={`body-2 truncate ${active ? '' : 'opacity-60'}`}
                  >
                    {member.name ?? 'Deleted user'}
                    {member.nickname !== null && (
                      <span className="text-text-secondary">
                        {' '}
                        ({member.nickname})
                      </span>
                    )}
                    {member.userId === viewerId && (
                      <span className="text-text-disabled"> · you</span>
                    )}
                  </p>
                  <p className="text-text-disabled body-3 truncate">
                    {member.email ?? '—'}
                  </p>
                </div>
              </div>

              <span className="body-3 w-24">{ROLE_LABELS[member.role]}</span>

              <span className="w-28">
                <span
                  className={`body-3 inline-flex items-center gap-1.5 rounded-4xl px-2 py-0.5 ${
                    active
                      ? 'bg-success-soft text-success-light'
                      : 'bg-action-selected text-text-secondary'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${active ? 'bg-success-main' : 'bg-text-disabled'}`}
                  />
                  {active ? 'Active' : 'Deactivated'}
                </span>
              </span>

              <span className="flex w-6 justify-end">
                {manageable(viewerRole, member) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={pending}
                      aria-label={`Manage ${displayName(member)}`}
                      className="hover:bg-action-hover text-text-disabled hover:text-text-primary flex size-6 items-center justify-center rounded-md disabled:opacity-60"
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end" className="w-52">
                      {/* The group is required rather than decorative:
                          `DropdownMenuLabel` is Base UI's `Menu.GroupLabel`,
                          which reads a context only `Menu.Group` provides and
                          throws at render without one. */}
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Org role</DropdownMenuLabel>
                        {offerable(viewerRole).map((role) => (
                          <DropdownMenuItem
                            key={role}
                            disabled={role === member.role}
                            onClick={() =>
                              run(() => changeMemberRole(member.userId, role))
                            }
                          >
                            {ROLE_LABELS[role]}
                            {role === member.role && (
                              <span className="text-text-disabled ml-auto">
                                current
                              </span>
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        variant={active ? 'destructive' : undefined}
                        onClick={() =>
                          run(() => setMemberActive(member.userId, !active))
                        }
                      >
                        {active ? 'Deactivate account' : 'Reactivate account'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {deactivated.length > 0 && (
        <p className="border-warning-outlined-border bg-warning-soft text-warning-light body-3 rounded-md border px-3.5 py-3">
          {deactivated.length === 1
            ? `${displayName(deactivated[0]!)} is deactivated and still holds whatever was assigned to them.`
            : `${deactivated.length} accounts are deactivated and still hold whatever was assigned to them.`}{' '}
          Work stays where it is until somebody moves it — switching an account
          off is never a reassignment.
        </p>
      )}
    </div>
  )
}

/** Nickname first, for the reason the glossary gives: it is what people say. */
function displayName(member: OrgMemberRow): string {
  return member.nickname ?? member.name ?? 'Deleted user'
}

function isActive(member: OrgMemberRow): boolean {
  return member.status === 'active'
}

/** Name, nickname and address, because a hundred people repeat the first two. */
function matches(member: OrgMemberRow, query: string): boolean {
  const wanted = query.trim().toLowerCase()

  if (wanted === '') return true

  return [member.name, member.nickname, member.email].some(
    (value) => value !== null && value.toLowerCase().includes(wanted),
  )
}

/**
 * Whether this viewer may act on this row at all.
 *
 * An admin may not touch an owner in either direction — not the role and not
 * the account — which is the rule that keeps ownership something only owners
 * hand out. A member may act on nobody, including themselves.
 */
function manageable(viewerRole: OrgRole | null, member: OrgMemberRow): boolean {
  if (viewerRole === 'owner') return true
  if (viewerRole === 'admin') return member.role !== 'owner'

  return false
}

/** An admin may hand out every role but their own ceiling. */
function offerable(viewerRole: OrgRole | null): readonly OrgRole[] {
  return viewerRole === 'owner'
    ? ORG_ROLES
    : ORG_ROLES.filter((role) => role !== 'owner')
}
