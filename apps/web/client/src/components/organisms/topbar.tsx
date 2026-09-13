import type { Me } from '@repo/shared'
import { SidebarTrigger } from '@repo/ui/components/sidebar'

import { UserMenu } from './user-menu'

/**
 * The bar across the top of every signed-in screen.
 *
 * It carries the account and the sidebar toggle, and deliberately little else.
 * The design draws two more things here — a global search box and an inbox
 * bell — and neither is drawn: the bell is marked Phase 3 in the design
 * itself, and search across tasks, projects and people has no endpoint in
 * Phase 1. A box that accepts typing and answers nothing teaches people the
 * feature is broken rather than absent, which is the more expensive lesson.
 *
 * Sticky rather than fixed, so it stays put while a long list scrolls under it
 * without the page having to reserve a gap for it.
 */
export function Topbar({ me }: { me: Me }) {
  return (
    <header className="bg-paper-elevation-0 border-divider sticky top-0 z-20 flex h-13 shrink-0 items-center gap-3 border-b px-4">
      <SidebarTrigger />

      <div className="flex-1" />

      <UserMenu me={me} />
    </header>
  )
}
