'use client'

import { Home } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import type { Me, Membership } from '@repo/shared'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@repo/ui/components/sidebar'

import { switchOrganisation } from '@/app/(signed-in)/actions'

import { Topbar } from './topbar'

/**
 * The frame around Home, and the one place with **no organisation switcher**.
 *
 * Home is the only screen that is not inside a company: it answers "what is on
 * my plate", crossing every organisation the person belongs to. A switcher at
 * the top of this sidebar would be a control that changes nothing on the page
 * under it — so instead of switching, the organisations are simply listed, and
 * picking one is how somebody *leaves* here for a company's own screens.
 *
 * That is why this is a second shell rather than a variant of `AppShell`. The
 * two differ in what the sidebar is *for*, not in which items it happens to
 * show.
 */
export function HomeShell({
  me,
  children,
}: {
  me: Me
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2.5 p-2">
            <span className="bg-primary-main text-primary-contrast subtitle-4 flex size-7.5 shrink-0 items-center justify-center rounded-xl font-bold">
              TF
            </span>
            <span className="min-w-0">
              <span className="subtitle-4 block truncate">Taskflow</span>
              <span className="text-text-secondary body-3 block">
                All organizations
              </span>
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  {/* No link: this shell exists on exactly one route, so the
                      item is a label for where you already are. */}
                  <SidebarMenuButton isActive>
                    <Home />
                    <span>Home</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Organizations</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {me.organizations.map((org) => (
                  <EnterOrganisation
                    key={org.orgId}
                    org={org}
                    active={org.orgId === me.activeOrgId}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <Topbar me={me} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

/**
 * One organisation, and the way into it.
 *
 * Two things at once, deliberately: it writes the `active_org` cookie *and*
 * navigates. Setting the cookie without going anywhere would leave somebody on
 * a page that looks identical — Home ignores the active organisation — with no
 * sign that anything happened.
 *
 * `active` marks the one already chosen rather than disabling the row, because
 * entering the organisation you are already set to is a perfectly ordinary
 * thing to want.
 */
function EnterOrganisation({
  org,
  active,
}: {
  org: Membership
  active: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            await switchOrganisation(org.orgId)
            router.push('/my-tasks')
          })
        }}
      >
        <span
          aria-hidden
          className="bg-action-selected text-text-secondary flex size-5 shrink-0 items-center justify-center rounded-md text-[0.6rem] font-bold"
        >
          {markOf(org.name)}
        </span>
        <span className="truncate">{org.name}</span>
        {active && (
          <span className="text-text-disabled body-3 ml-auto">Current</span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/** Up to two letters, from the first two words or the first two characters. */
function markOf(name: string): string {
  const words = name.split(/\s+/).filter((word) => word !== '')

  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase()
  }

  return [...name].slice(0, 2).join('').toUpperCase()
}
