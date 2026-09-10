import Link from 'next/link'

import type { ProjectRow } from '@repo/shared'

import { ProjectDot } from '../atoms/project-dot'

/**
 * One project in the list.
 *
 * It leads with the colour and the prefix rather than the description, because
 * those are what somebody matches against a task key they were sent — `OPS-14`
 * in a chat message is the usual reason this screen gets opened at all.
 *
 * `role` being null means they are seeing this project as an organisation
 * owner or admin rather than as a member of it. Worth saying: it is the
 * difference between "my project" and "a project I can administer", and the
 * settings they are offered differ.
 */
export function ProjectCard({ project }: { project: ProjectRow }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="bg-paper-elevation-0 border-divider hover:border-divider-soft hover:bg-action-hover flex flex-col gap-2 rounded-lg border p-4 transition-colors"
    >
      <span className="flex items-center gap-2">
        <ProjectDot color={project.color} />
        <span className="text-text-primary subtitle-3 min-w-0 flex-1 truncate">
          {project.name}
        </span>
        <span className="text-text-secondary body-3 font-mono">
          {project.keyPrefix}
        </span>
      </span>

      {project.description !== null && (
        <span className="text-text-secondary body-3 line-clamp-2">
          {project.description}
        </span>
      )}

      <span className="text-text-disabled body-3">
        {project.role === null
          ? 'Organisation access'
          : `You are ${project.role}`}
      </span>
    </Link>
  )
}
