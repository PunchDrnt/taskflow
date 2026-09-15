import type { OrgRole } from '@repo/shared'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui/components/tabs'

import { PageBody } from '@/components/atoms/page-body'
import { OrgGeneralForm } from '@/components/organisms/org-general-form'
import { OrgMembers } from '@/components/organisms/org-members'
import { currentUser } from '@/lib/api/me'
import { fetchOrganization, fetchOrgMembers } from '@/lib/api/org'
import { apiForRender } from '@/lib/api/server'

/**
 * The organisation itself: what it is called, who is in it, and who may do
 * what.
 *
 * Tabs for the reason the project's settings screen gives — these are settings
 * for one thing and the list of them grows. The design draws six; three are
 * built, and the three that are not are absent rather than dimmed:
 *
 * - **Invitations** has nothing behind it. `organization.invitations` is
 *   migrated and unread until Phase 2, and Phase 1 adds people directly —
 *   which is the Members tab's own button, saying so.
 * - **Teams** has no endpoint at all in Phase 1.
 * - **Danger zone** is transfer-ownership, leave and delete, all Phase 2 and
 *   all needing a confirmation flow before an API call that cannot be undone.
 *
 * The design marks the first of those "Phase 2" and dims it. A tab somebody
 * can click into and find nothing is a worse promise than a tab that is not
 * there yet, and this file is where the missing ones are recorded instead.
 *
 * **Everybody may read this screen; who may change what differs.** A member
 * gets `read all` from `ability.ts`, so the list and the roles table are
 * theirs to see — an organisation whose people are a secret from its own
 * people is not a useful one.
 */
export default async function OrganizationSettingsPage() {
  const api = await apiForRender()
  const [organization, members, me] = await Promise.all([
    fetchOrganization(api),
    fetchOrgMembers(api),
    // Cached per request, so the layout above already paid for this one.
    currentUser(),
  ])

  const role: OrgRole | null = me?.role ?? null

  return (
    <PageBody width="wide" className="gap-6">
      <header>
        <p className="text-text-secondary body-3 mb-1.5">
          {organization.name} <span className="text-text-disabled">/</span>{' '}
          Settings
        </p>
        <h1 className="h5">Organisation settings</h1>
        <p className="text-text-secondary body-2 mt-1">
          {members.length} {members.length === 1 ? 'person' : 'people'}.{' '}
          {role === 'owner'
            ? 'You own this organisation, so all of it is yours to change.'
            : role === 'admin'
              ? 'Admins run the people; the organisation itself is the owners’.'
              : 'Members can read these; owners and admins change them.'}
        </p>
      </header>

      <Tabs defaultValue="members">
        <TabsList
          variant="line"
          className="border-divider w-full justify-start border-b"
        >
          <TabsTrigger value="members" className="flex-none px-3">
            Members
          </TabsTrigger>
          <TabsTrigger value="general" className="flex-none px-3">
            General
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex-none px-3">
            Roles
          </TabsTrigger>
        </TabsList>

        {/* Members first, not General: the thing people open this screen for
            is somebody joining, leaving or needing different rights. The name
            of the organisation is set once and read after that. */}
        <TabsContent value="members" className="pt-4">
          <OrgMembers
            members={members}
            viewerRole={role}
            viewerId={me?.id ?? ''}
          />
        </TabsContent>

        <TabsContent value="general" className="pt-4">
          <OrgGeneralForm
            organization={organization}
            editable={role === 'owner'}
          />
        </TabsContent>

        <TabsContent value="roles" className="pt-4">
          <RoleMatrix />
        </TabsContent>
      </Tabs>
    </PageBody>
  )
}

/**
 * What each role may do — **read out of `ability.ts`, not out of the design.**
 *
 * The two disagree in one row and it is not a detail: the design ticks "change
 * organisation settings" for an admin, and the code does the opposite —
 * `cannot('update', 'Organization')` is one of exactly two things separating
 * an admin from an owner. A table that described the design would be a table
 * that lies to the person deciding who to promote.
 *
 * Static markup rather than data, because it is prose: every row is a sentence
 * somebody wrote, and a loop over a constant would only move the sentences.
 */
function RoleMatrix() {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-paper-elevation-0 border-divider overflow-hidden rounded-lg border">
        <div className="border-divider text-text-disabled overlined flex items-center gap-3 border-b px-4 py-2">
          <span className="flex-1">Permission</span>
          <span className="w-16 text-center">Owner</span>
          <span className="w-16 text-center">Admin</span>
          <span className="w-16 text-center">Member</span>
        </div>

        {PERMISSIONS.map((permission) => (
          <div
            key={permission.label}
            className="border-divider-soft flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
          >
            <span className="body-2 min-w-0 flex-1">{permission.label}</span>
            {[permission.owner, permission.admin, permission.member].map(
              (allowed, index) => (
                <span
                  key={index}
                  className={`body-2 w-16 text-center ${
                    allowed ? 'text-primary-light' : 'text-text-disabled'
                  }`}
                >
                  {allowed ? '✓' : '—'}
                </span>
              ),
            )}
          </div>
        ))}
      </div>

      <p className="text-text-disabled body-3 max-w-140">
        Roles are organisation-wide and project membership sits on top of them:
        a member sees only the projects they have been added to, while owners
        and admins see every project in the organisation. Removing somebody from
        an organisation, and handing over ownership, arrive in Phase 2.
      </p>
    </div>
  )
}

interface Permission {
  label: string
  owner: boolean
  admin: boolean
  member: boolean
}

const PERMISSIONS: Permission[] = [
  {
    label: 'Read the projects they are a member of',
    owner: true,
    admin: true,
    member: true,
  },
  {
    label: 'See every project in the organisation',
    owner: true,
    admin: true,
    member: false,
  },
  {
    label: 'Create and edit tasks in those projects',
    owner: true,
    admin: true,
    member: true,
  },
  { label: 'Create projects', owner: true, admin: true, member: false },
  {
    label: 'Add people to the organisation',
    owner: true,
    admin: true,
    member: false,
  },
  {
    label: 'Make somebody an admin, or a member again',
    owner: true,
    admin: true,
    member: false,
  },
  {
    label: 'Appoint or demote an owner',
    owner: true,
    admin: false,
    member: false,
  },
  {
    label: 'Deactivate an account',
    owner: true,
    admin: true,
    member: false,
  },
  {
    label: 'Rename the organisation',
    owner: true,
    admin: false,
    member: false,
  },
]
