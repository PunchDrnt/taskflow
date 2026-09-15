'use client'

import { useTransition } from 'react'

import { Button } from '@repo/ui/components/button'

import { signOut } from '@/app/(signed-in)/actions'

/**
 * Signing out from a screen with no top bar.
 *
 * The only such screen is the one somebody in no organisation lands on, and it
 * is exactly the screen a wrong account is discovered from — signed in as
 * somebody who has not been added to a company yet, with nothing else on the
 * page to press. `UserMenu` covers everywhere else.
 */
export function SignOutButton() {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="ghost"
      color="neutral"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await signOut()
        })
      }}
    >
      {pending ? 'Signing out…' : 'Log out'}
    </Button>
  )
}
