'use client'

import { Home, ListTodo } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import type { Me } from '@repo/shared'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@repo/ui/components/sidebar'

import { OrgSwitcher } from './org-switcher'

/**
 * The frame every signed-in screen sits in.
 *
 * The organisation switcher is at the very top of the sidebar, which
 * docs/04-features/phase-1.md#organization asks for by position: it is the
 * answer to "whose data am I looking at", and that question is asked before
 * any other on the page.
 *
 * ⚠️ **Home is deliberately *not* filtered by the switcher.** Everything else
 * in this sidebar shows one organisation; Home shows all of them, because it is
 * a question about the person. Putting it inside the same frame is what makes
 * the difference visible — you can see the switcher not applying — rather than
 * leaving Home as a screen with no context at all.
 */
export function AppShell({
  me,
  children,
}: {
  me: Me
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
                  href="/home"
                  label="Home"
                  active={pathname === '/home'}
                >
                  <Home className="size-4" />
                </NavItem>
                <NavItem
                  href="/my-tasks"
                  label="My Tasks"
                  active={pathname.startsWith('/my-tasks')}
                >
                  <ListTodo className="size-4" />
                </NavItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset>{children}</SidebarInset>
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
