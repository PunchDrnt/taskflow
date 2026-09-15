import { notFound } from 'next/navigation'

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui/components/tabs'

import { PageBody } from '@/components/atoms/page-body'
import { ProjectDot } from '@/components/atoms/project-dot'
import { ProjectGeneralForm } from '@/components/organisms/project-general-form'
import { StatusSettings } from '@/components/organisms/status-settings'
import { projectByKey } from '@/lib/api/projects'
import { apiForRender } from '@/lib/api/server'
import { fetchStatuses } from '@/lib/api/statuses'

/**
 * Everything about one project that is not a task.
 *
 * Tabs rather than a page each, because these are settings for one thing and
 * the list of them grows: members, sprints and archiving are all drawn in the
 * design and all belong here later. Two are built — how the project is
 * labelled, and the columns of its board — and the rest arrive as tabs rather
 * than as another level of navigation.
 *
 * Custom statuses are why this screen exists at all: the four a new project
 * starts with (To do, In progress, Done, Cancelled) are a starting point, not
 * the set. Cancelled is among them from the start on purpose — Phase 2's
 * sub-task progress takes cancelled work out of the denominator, and a project
 * without one gets abandoned work marked Done instead, which makes every
 * closed sprint's numbers wrong retrospectively.
 */
export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectKey: string }>
}) {
  const { projectKey } = await params
  const api = await apiForRender()

  // The URL names the project by its key prefix and nothing below this line
  // does — `projectByKey` says why. Null is a 404 for the same reason the API
  // answers one: a project the caller may not see must not be distinguishable
  // from a prefix nobody has taken.
  const project = await projectByKey(api, projectKey)

  if (project === null) notFound()

  const projectId = project.id
  const statuses = await fetchStatuses(api, projectId)

  return (
    <PageBody width="wide" className="gap-6">
      <header>
        {/* A breadcrumb, not a back button. Every screen this project has is
            in the sidebar now, so a control whose only job is to return one
            level up is a second way to do what is already on screen. */}
        <p className="text-text-secondary body-3 mb-1.5">
          {project.name} <span className="text-text-disabled">/</span> Settings
        </p>
        <h1 className="h5 flex items-center gap-2">
          <ProjectDot color={project.color} />
          Project settings
        </h1>
        <p className="text-text-secondary body-2 mt-1">
          Changes to the board save immediately; the name and colour save when
          you press the button.
        </p>
      </header>

      <Tabs defaultValue="general">
        {/* `w-fit`, not `w-full`: two tabs stretched across a 1024px card put
            a hand-width gap between them and read as two separate headings. */}
        <TabsList
          variant="line"
          className="border-divider w-full justify-start border-b"
        >
          {/* The rule spans the card, the tabs do not. `TabsTrigger` is
              `flex-1` by default, which across this width puts a hand's width
              between two of them and makes them read as two headings rather
              than as one control. */}
          <TabsTrigger value="general" className="flex-none px-3">
            General
          </TabsTrigger>
          <TabsTrigger value="statuses" className="flex-none px-3">
            Statuses
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="pt-4">
          <ProjectGeneralForm project={project} />
        </TabsContent>

        {/* No blurb here: the tab owns its own, because the rules it has to
            state are about the controls in it and belong beside them. */}
        <TabsContent value="statuses" className="pt-4">
          <StatusSettings projectId={projectId} statuses={statuses} />
        </TabsContent>
      </Tabs>
    </PageBody>
  )
}
