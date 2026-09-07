import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm'

import {
  PROJECT_ERROR_CODES,
  type CreateProjectInput,
  type ListProjectsQuery,
  type ScopedRole,
} from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { requireOrgContext } from '#shared/org-scope/request-context'
import { sequence } from '#shared/sort-order'

import type { Action } from '../../permission/ability'
import { actorFromContext, type Actor } from '../../permission/actor'
import { PermissionService } from '../../permission/permission.service'
import { AuditService } from '../audit/audit.service'
import { DEFAULT_STATUSES } from './default-statuses'
import { ProjectMember } from './project-member.entity'
import { Project } from './project.entity'
import { Status } from './status.entity'

/** A project as a screen needs it. */
export interface ProjectView {
  id: string
  name: string
  description: string | null
  color: string
  keyPrefix: string
  /** Non-null means hidden from the sidebar and from pickers, not deleted. */
  archivedAt: Date | null
  /**
   * What the caller is *in this project*, or null when they are not in it and
   * are seeing it because they run the organisation. The sidebar reads it to
   * decide whether to draw project settings.
   */
  role: ScopedRole | null
}

/** A project the caller may see, with the membership that made it visible. */
export interface VisibleProject {
  project: Project
  role: ScopedRole | null
}

/** Postgres's code for a unique violation — here, a name already in use. */
const UNIQUE_VIOLATION = '23505'

@Injectable()
export class ProjectService {
  constructor(
    @InjectOrgRepository(Project)
    private readonly projects: OrgScopedRepository<Project>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The projects this caller may see, which is not the same list for everyone
   * in the organisation.
   *
   * 🔒 **The gate is in the query, not in a filter afterwards and not in the
   * sidebar.** docs/04-features/phase-1.md#สิทธิ์ระดับ-project-กั้นจริงตั้งแต่-phase-1:
   * a member sees only the projects they have joined, and an org owner or
   * admin sees all of them — which exists so a project whose members have all
   * left does not become unreachable. Filtering rows the database already
   * returned would still have sent them over the wire, and hiding a link in
   * the UI stops nobody who knows the URL.
   *
   * ⚠️ **This is the one rule expressed twice** — as SQL here and as CASL in
   * `ability.ts` — and it is unavoidable: `can()` answers about one row, and a
   * list needs a WHERE clause. So the two are held together by a test rather
   * than by care: `test/project.spec.ts` asserts that for every role, what
   * this returns is exactly the set `can('read', 'Project', { id })` says yes
   * to. Change one and the other goes red.
   */
  async list(
    query: ListProjectsQuery = { includeArchived: false },
  ): Promise<ProjectView[]> {
    const { userId } = requireOrgContext()
    const actor = actorFromContext()

    const builder = this.projects.queryBuilder
      .withOrg('project')
      .leftJoin(
        ProjectMember,
        'membership',
        'membership.projectId = project.id AND membership.userId = :userId',
        { userId },
      )
      .select('project.id', 'id')
      .addSelect('project.name', 'name')
      .addSelect('project.description', 'description')
      .addSelect('project.color', 'color')
      .addSelect('project.key_prefix', 'keyPrefix')
      .addSelect('project.archived_at', 'archivedAt')
      .addSelect('membership.role', 'role')
      .andWhere('project.deletedAt IS NULL')
      .orderBy('project.name', 'ASC')

    if (!query.includeArchived) {
      builder.andWhere('project.archivedAt IS NULL')
    }

    // The gate. An owner or an admin runs the organisation and sees every
    // project in it; anybody else sees the ones the join found them in.
    if (actor.orgRole === 'member') {
      builder.andWhere('membership.id IS NOT NULL')
    }

    return builder.getRawMany<ProjectView>()
  }

  /**
   * One project, or 404 — including when it exists and the caller may not see
   * it.
   *
   * **404 rather than 403, and the difference is deliberate.** A 403 on a
   * project a member has not joined confirms that a project with that id
   * exists in their organisation, which is exactly what "a member sees only
   * the projects they are in" is meant to withhold. The codebase already
   * answers 404 for a row in another org for the same reason.
   *
   * The split it draws: **not being able to see it is 404, not being allowed
   * to change it is 403.** Someone looking at a project they belong to and
   * lacking the rights to rename it should be told so plainly — hiding it at
   * that point would only look like a bug.
   */
  async findVisible(id: string): Promise<VisibleProject> {
    const { userId } = requireOrgContext()

    const project = await this.projects.queryBuilder
      .withOrg('project')
      .andWhere('project.id = :id', { id })
      .andWhere('project.deletedAt IS NULL')
      .getOne()

    if (!project) throw notFound()

    const membership = await this.projects.queryBuilder
      .base('project')
      .select('membership.role', 'role')
      .innerJoin(
        ProjectMember,
        'membership',
        'membership.projectId = project.id AND membership.userId = :userId',
        { userId },
      )
      .where('project.id = :id', { id })
      .getRawOne<{ role: ScopedRole }>()

    const role = membership?.role ?? null

    // Asked of the rules rather than re-derived: the actor carries this
    // project's role and nothing else, so a conditional rule can only match
    // the project actually being asked about.
    if (!this.permissions.can(actorFor(role, id), 'read', 'Project', { id })) {
      throw notFound()
    }

    return { project, role }
  }

  /** The same project, shaped for a client. */
  async findById(id: string): Promise<ProjectView> {
    const { project, role } = await this.findVisible(id)

    return view(project, role)
  }

  /**
   * The project, having checked the caller may do `action` to it — the entry
   * point for everything that changes one, and for the endpoints that hang off
   * it.
   *
   * Two questions in a fixed order, because they have different answers: can
   * this caller *see* it (404 if not, so a refusal does not confirm the row),
   * and then may they do this to it (403, because at that point they can see
   * it and deserve to be told plainly). Running them the other way round would
   * leak the row's existence through the 403.
   */
  async requireProject(id: string, action: Action): Promise<VisibleProject> {
    const visible = await this.findVisible(id)

    this.permissions.assert(actorFor(visible.role, id), action, 'Project', {
      id,
    })

    return visible
  }

  /**
   * Creates a project, the statuses it needs to hold work, and its first
   * member — in one transaction.
   *
   * All three together because two of them are not optional extras. A project
   * with no statuses cannot hold a task at all (`tasks.status_id` is NOT
   * NULL), so a create that committed the row and then failed would leave
   * something that looks like a project in every list and rejects the first
   * task anybody files in it. See `DEFAULT_STATUSES`.
   *
   * **The creator is added as its admin.** Not ceremony: project membership is
   * what `ProjectService.list` joins on, so without it whoever just created
   * the project would not see it in their own sidebar unless they happened to
   * run the organisation. There is deliberately no "last project admin" rule
   * to match §3's last-owner one — a project with no admins is still fully
   * administrable by the org's owners and admins, so it cannot become
   * unreachable the way an ownerless organisation can.
   *
   * Who may call this is checked here rather than by `@RequirePermission`: the
   * subject is `Project` and the decorator only admits `Organization`, on
   * purpose — see `ContextResolvedSubject`. Creating names no row, so `{}` is
   * the honest resource and every conditional rule correctly fails against it.
   */
  async create(input: CreateProjectInput): Promise<ProjectView> {
    const { orgId, userId } = requireOrgContext()

    // docs/04-features/phase-1.md#project — an owner or an admin, never a
    // member.
    this.permissions.assert(actorFromContext(), 'create', 'Project', {})

    return this.dataSource.transaction(async (manager) => {
      const project: Project = {
        ...(await this.insertProject(manager, input, orgId, userId)),
      }

      const keys = sequence(DEFAULT_STATUSES.length)

      await manager.insert(
        Status,
        DEFAULT_STATUSES.map((status, index) => ({
          orgId,
          projectId: project.id,
          name: status.name,
          color: status.color,
          sortOrder: keys[index]!,
          isDefault: status.isDefault ?? false,
          isDoneType: status.isDoneType ?? false,
          isCancelledType: status.isCancelledType ?? false,
          createdBy: userId,
          updatedBy: userId,
        })),
      )

      await manager.insert(ProjectMember, {
        orgId,
        projectId: project.id,
        userId,
        role: 'admin',
        createdBy: userId,
        updatedBy: userId,
      })

      await this.audit.record(manager, {
        entityType: 'project',
        entityId: project.id,
        action: 'created',
        changes: {
          name: { from: null, to: project.name },
          keyPrefix: { from: null, to: project.keyPrefix },
          color: { from: null, to: project.color },
        },
      })

      return view(project, 'admin')
    })
  }

  /** The row, or a 409 if the name is taken — separated to keep create readable. */
  private async insertProject(
    manager: EntityManager,
    input: CreateProjectInput,
    orgId: string,
    userId: string,
  ): Promise<Project> {
    const row = {
      orgId,
      name: input.name,
      description: input.description ?? null,
      color: input.color,
      keyPrefix: input.keyPrefix,
      createdBy: userId,
      updatedBy: userId,
    }

    try {
      const inserted = await manager.insert(Project, row)

      // `insert` returns the generated columns only, so the values that were
      // sent are merged back rather than read again in a second statement.
      return { ...(inserted.generatedMaps[0] as Project), ...row }
    } catch (error) {
      throw nameClash(error, input.name)
    }
  }
}

/**
 * The caller as the permission rules should see them for one project.
 *
 * `projectRoles` holds that project alone. Loading every project a person is
 * in to answer a question about one of them would be the double load the
 * `@RequirePermission` decorator refuses to do in a guard — and a map with
 * other ids in it invites a rule to match the wrong one.
 */
function actorFor(role: ScopedRole | null, projectId: string): Actor {
  const actor = actorFromContext()

  return role === null
    ? actor
    : { ...actor, projectRoles: { [projectId]: role } }
}

function notFound(): ApiException {
  return ApiException.notFound('ไม่พบโปรเจกต์นี้')
}

export function view(project: Project, role: ScopedRole | null): ProjectView {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    color: project.color,
    keyPrefix: project.keyPrefix,
    archivedAt: project.archivedAt,
    role,
  }
}

/**
 * A unique violation on `projects_org_name_unique`, turned into something the
 * client can act on. Anything else is re-thrown untouched — swallowing it
 * would report a dropped connection as a name that is already in use.
 *
 * The index is partial (`WHERE deleted_at IS NULL`), so a deleted project
 * releases its name and a live one holds it.
 */
export function nameClash(error: unknown, name: string | undefined): unknown {
  const driver = error instanceof QueryFailedError ? error.driverError : null
  const code = (driver as { code?: string } | null)?.code

  if (code !== UNIQUE_VIOLATION || name === undefined) return error

  return new ApiException(
    409,
    PROJECT_ERROR_CODES.NAME_TAKEN,
    `มีโปรเจกต์ชื่อ "${name}" อยู่แล้ว`,
  )
}
