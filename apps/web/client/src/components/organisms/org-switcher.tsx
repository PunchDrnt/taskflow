'use client'

import { Check, ChevronsUpDown } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import type { Membership } from '@repo/shared'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu'

import { switchOrganisation } from '../../app/(signed-in)/actions'

/**
 * Which company this session is working in, at the top of the sidebar.
 *
 * Drawn even for somebody in exactly one organisation: it is the label that
 * tells you *whose* data is on screen, and a person with one employer today
 * has two the first time they help a friend's company. Hiding it until there
 * is a choice would mean the answer to "whose tasks am I looking at" appears
 * and disappears.
 *
 * ⚠️ **`router.refresh()` after the action, not instead of it.** The action
 * revalidates on the server; the refresh is what makes *this* tab re-render
 * with what came back. Without it the cookie has changed and the screen has
 * not, which reads as the switch having silently failed.
 */
export function OrgSwitcher({
  organizations,
  activeOrgId,
}: {
  organizations: Membership[]
  activeOrgId: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const active = organizations.find((org) => org.orgId === activeOrgId)

  const choose = (orgId: string) => {
    if (orgId === activeOrgId) return

    startTransition(async () => {
      await switchOrganisation(orgId)
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className="border-default hover:bg-subtle flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left disabled:opacity-60"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {active?.name ?? 'Choose an organisation'}
          </span>
          {active !== undefined && (
            <span className="text-text-secondary block text-xs capitalize">
              {active.role}
            </span>
          )}
        </span>
        <ChevronsUpDown className="text-text-secondary size-4 shrink-0" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        {/* The group is required, not decorative: `DropdownMenuLabel` is Base
            UI's `Menu.GroupLabel`, which reads a context only `Menu.Group`
            provides and throws at render without one. It is also what ties the
            heading to the list for a screen reader. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Organisations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {organizations.map((org) => (
            <DropdownMenuItem
              key={org.orgId}
              onClick={() => {
                choose(org.orgId)
              }}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">{org.name}</span>
              {org.orgId === activeOrgId && (
                <Check className="size-4 shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
