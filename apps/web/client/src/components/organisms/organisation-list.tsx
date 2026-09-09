import type { Membership } from '@repo/shared'

/**
 * The organisations this person belongs to.
 *
 * On Home rather than only in the switcher because Home is the one screen that
 * is not inside any of them — somebody with a day job and a company of their
 * own should be able to see both listed before choosing which to work in.
 *
 * Not links yet: switching organisations writes the `active_org` cookie, which
 * needs `POST /v1/me/active-org` through a Server Action, and that arrives with
 * the switcher in the organisation-scoped layout.
 */
export function OrganisationList({
  organizations,
}: {
  organizations: Membership[]
}) {
  return (
    <section>
      <h2 className="overlined text-text-secondary mb-2 font-medium tracking-wide">
        Your organisations
      </h2>
      <ul className="bg-paper-elevation-0 border-divider divide-divider divide-y rounded-lg border">
        {organizations.map((org) => (
          <li
            key={org.orgId}
            className="flex items-center justify-between px-4 py-3"
          >
            <span className="body-2 font-medium">{org.name}</span>
            <span className="text-text-secondary body-3 capitalize">
              {org.role}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
