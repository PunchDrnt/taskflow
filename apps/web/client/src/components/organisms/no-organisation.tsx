import { Button } from '@repo/ui/components/button'

/**
 * What somebody sees when they can sign in but belong to no organisation.
 *
 * A real state, not an edge case: `RequestContext.orgId` is nullable precisely
 * so it can exist, an account created for somebody before they are added to a
 * company lands here, and the API answers `NO_ORGANIZATION` — a different code
 * from `ORG_NOT_SELECTED` for exactly this reason, so that somebody with three
 * companies is never sent to a page telling them they have none.
 *
 * The "Create organisation" button is **drawn and deliberately inert** until
 * Phase 3: docs/04-features/phase-1.md#organization asks for the shape to be
 * agreed now, while creating one stays an API-and-seed-script job. A button
 * that does nothing is worse than no button, so it says what it is.
 */
export function NoOrganisation({ name }: { name: string }) {
  return (
    <main className="bg-subtle flex min-h-screen items-center justify-center p-6">
      <div className="bg-default border-default w-full max-w-md rounded-xl border p-8 text-center shadow-sm">
        <h1 className="text-headline-sm mb-2 font-bold">
          You are not in an organisation yet
        </h1>
        <p className="text-text-secondary mb-6 text-sm">
          Hi {name}. Your account works, but there is no company attached to it
          yet — ask an administrator to add you, and this page becomes your
          work.
        </p>

        <div className="border-default flex flex-col gap-3 border-t pt-6">
          <Button variant="outline" disabled className="w-full">
            Create an organisation
          </Button>
          <p className="text-text-secondary text-xs">
            Not available yet. Until Phase 3, organisations are created through
            the API or a seed script.
          </p>
        </div>

        <p className="text-text-secondary mt-6 text-xs">
          Emailed invitations you can accept yourself arrive in Phase 2.
        </p>
      </div>
    </main>
  )
}
