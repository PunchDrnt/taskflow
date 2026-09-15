import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { useTransition } from 'react'

import type { Me } from '@repo/shared'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu'

import { signOut } from '@/app/(signed-in)/actions'
import { initialOf, UserAvatar } from '@/components/molecules/user-avatar'

/**
 * Who is signed in, and the two things they can do about it.
 *
 * Signing out lives **here and nowhere else**, which is why this component is
 * in the top bar of every signed-in screen rather than on the profile page:
 * the way out of an application should not be somewhere you have to navigate
 * to, and a session that cannot be ended from the screen you are on is one
 * people end by closing the tab instead.
 *
 * The name and address are repeated inside the menu even though the trigger
 * already shows a nickname. Nicknames repeat by design — the glossary is
 * explicit that they may — so the address is the line that actually answers
 * "which account is this", which matters on a shared machine.
 */
export function UserMenu({ me }: { me: Me }) {
  const [pending, startTransition] = useTransition()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        aria-label="Your account"
        className="hover:bg-action-hover flex items-center gap-2 rounded-4xl py-1 pr-2 pl-1 disabled:opacity-60"
      >
        <UserAvatar
          userId={me.id}
          avatarUrl={me.avatarUrl}
          fallback={initialOf(me.nickname)}
          size="sm"
        />
        <span className="body-2 max-w-32 truncate">{me.nickname}</span>
        <ChevronDown className="text-text-secondary size-3.5 shrink-0" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <div className="border-divider-soft mb-1 border-b px-2 pt-1 pb-2">
          <p className="body-2 truncate font-medium">{me.name}</p>
          <p className="text-text-secondary body-3 truncate">{me.email}</p>
        </div>

        <DropdownMenuItem render={<Link href="/settings/profile" />}>
          Profile &amp; password
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onClick={() => {
            // In a transition because the action redirects: without one the
            // menu unmounts mid-navigation and the press has nothing left to
            // report pending against.
            startTransition(async () => {
              await signOut()
            })
          }}
        >
          {pending ? 'Signing out…' : 'Log out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
