import type { ProjectRow } from '@repo/shared'

import { AppShell } from '../../../components/organisms/app-shell'
import { currentUser } from '../../../lib/api/me'
import { fetchProjects } from '../../../lib/api/projects'
import { apiForRender } from '../../../lib/api/server'

/**
 * The frame around one organisation's screens.
 *
 * Everything in here is scoped by the switcher at the top of the sidebar,
 * which is what separates this group from `(home)`.
 *
 * Somebody in no organisation gets no shell: a switcher with nothing in it,
 * above navigation that all leads to `NO_ORGANIZATION`, is a worse answer than
 * the bare page — and the profile screen underneath still has to work for that
 * account, since `GET /v1/me` is `@SkipOrgScope()`.
 */
export default async function OrgLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const me = await currentUser()

  if (me === null || me.organizations.length === 0) return children

  // Nothing to list until one is chosen, and asking anyway is a guaranteed
  // `ORG_NOT_SELECTED` — the state somebody in two companies is in on the
  // first render after signing in.
  const projects: ProjectRow[] =
    me.activeOrgId === null ? [] : await fetchProjects(await apiForRender())

  return (
    <AppShell me={me} projects={projects}>
      {children}
    </AppShell>
  )
}
