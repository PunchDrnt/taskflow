import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@repo/ui/components/empty'

import { ProjectCard } from '../../../components/molecules/project-card'
import { NewProjectDialog } from '../../../components/organisms/new-project-dialog'
import { fetchProjects } from '../../../lib/api/projects'
import { apiForRender } from '../../../lib/api/server'

/**
 * Every project in this organisation that the caller may see.
 *
 * 🔒 "May see" is decided in SQL, not here and not in the sidebar. A member
 * gets an `INNER JOIN project.members`; an owner or admin gets no join at all.
 * Filtering on this side would mean the rows had already been sent, and
 * anybody who knew a URL could read what the list politely omitted.
 *
 * Archived projects are absent, which is the API's default and the whole point
 * of archiving: it hides a project from sidebars and pickers without deleting
 * anything. Bringing one back is `DELETE /v1/projects/:id/archive`, which has
 * no screen yet.
 */
export default async function ProjectsPage() {
  const projects = await fetchProjects(await apiForRender())

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="h6">Projects</h1>
          <p className="text-text-secondary body-2 mt-1">
            Where tasks live. Each one keeps its own statuses and its own
            members.
          </p>
        </div>

        <NewProjectDialog />
      </header>

      {projects.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              A project is closer to a Slack channel than to a department — make
              one per piece of work, not one per team.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}
