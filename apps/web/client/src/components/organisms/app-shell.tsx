'use client'

import { Home, ListTodo, Plus } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import type { Me, ProjectRow } from '@repo/shared'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from '@repo/ui/components/sidebar'

import { ProjectDot } from '@/components/atoms/project-dot'

import { OrgSwitcher } from './org-switcher'
import { Topbar } from './topbar'

/**
 * The frame every signed-in screen sits in.
 *
 * The organisation switcher is at the very top of the sidebar, which
 * docs/04-features/phase-1.md#organization asks for by position: it is the
 * answer to "whose data am I looking at", and that question is asked before
 * any other on the page.
 *
 * The projects are **in the sidebar, not only on a page of their own**. A
 * tracker is navigated by project a dozen times an hour, and a list that lives
 * one click away turns every one of those into two — which is why the design
 * puts them here and why they are worth the extra request in the layout.
 *
 * ⚠️ **Home is deliberately *not* filtered by the switcher.** Everything else
 * in this sidebar shows one organisation; Home shows all of them, because it is
 * a question about the person. It sits in the footer, apart from the rest, for
 * the same reason: it is the way *out* of the current organisation rather than
 * another place inside it.
 *
 * Nothing about the account is in here — the profile and signing out are in
 * `Topbar`, which is where somebody looks for them.
 */
export function AppShell({
  me,
  projects,
  children,
}: {
  me: Me
  /** Empty while no organisation is chosen: there is nothing to list yet. */
  projects: ProjectRow[]
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <OrgSwitcher
            organizations={me.organizations}
            activeOrgId={me.activeOrgId}
          />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem
                  href="/my-tasks"
                  label="My tasks"
                  active={pathname.startsWith('/my-tasks')}
                >
                  <ListTodo />
                </NavItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Projects</SidebarGroupLabel>

            {/* To the list rather than straight to a dialog: the page behind it
                is the context somebody needs before adding a fifth project
                called "Website". */}
            <SidebarGroupAction
              render={<Link href="/projects" aria-label="All projects" />}
            >
              <Plus />
            </SidebarGroupAction>

            <SidebarGroupContent>
              <SidebarMenu>
                {projects.map((project) => (
                  <ProjectItem
                    key={project.id}
                    project={project}
                    pathname={pathname}
                  />
                ))}

                {projects.length === 0 && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={pathname === '/projects'}
                      render={<Link href="/projects" />}
                    >
                      <Plus />
                      <span>New project</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <NavItem href="/home" label="Home" active={pathname === '/home'}>
              <Home />
            </NavItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <Topbar me={me} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

function NavItem({
  href,
  label,
  active,
  children,
}: {
  href: string
  label: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <SidebarMenuItem>
      {/* `render`, not `asChild`: @repo/ui is built on Base UI, whose
          composition prop takes the element to render as rather than reading
          it from children. */}
      <SidebarMenuButton isActive={active} render={<Link href={href} />}>
        {children}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/**
 * A project in the sidebar, with the screens that belong to it underneath.
 *
 * **Its settings live here and nowhere else.** They used to be a button in the
 * top right of the board, which put a page about the project inside the page
 * about its tasks and left it competing with the board for the same corner;
 * the design puts every screen a project has in one place, and the sidebar is
 * already where somebody goes to change what they are looking at.
 *
 * The children show for the open project only. There is no expand control and
 * no stored open/shut state, because there is nothing to remember: two entries
 * under the one project somebody is looking at is a list, and two under all
 * twelve is a wall.
 */
function ProjectItem({
  project,
  pathname,
}: {
  project: ProjectRow
  pathname: string
}) {
  // The key prefix, not the id: it is what the address bar shows and what
  // somebody pastes to a colleague.
  const href = `/projects/${project.keyPrefix}`
  // Not `startsWith(href)` on its own — prefixes are free-text, so a project
  // called DEV would light up while somebody is looking at DEVOPS. The
  // boundary has to be the segment, which is what the slash is.
  const open = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={open} render={<Link href={href} />}>
        <ProjectDot color={project.color} />
        <span>{project.name}</span>
      </SidebarMenuButton>

      {open && (
        <SidebarMenuSub>
          {[
            { label: 'Tasks', href },
            { label: 'Settings', href: `${href}/settings` },
          ].map((child) => (
            <SidebarMenuSubItem key={child.href}>
              <SidebarMenuSubButton
                isActive={pathname === child.href}
                render={<Link href={child.href} />}
              >
                <span>{child.label}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  )
}
