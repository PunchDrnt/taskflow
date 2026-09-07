import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm'

import {
  PROJECT_ERROR_CODES,
  type CreateProjectInput,
  type ScopedRole,
} from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { requireOrgContext } from '#shared/org-scope/request-context'
import { sequence } from '#shared/sort-order'

import { actorFromContext } from '../../permission/actor'
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
   * are seeing it because they run the organisation. The sidebar needs it to
   * decide whether to draw project settings; it is not what any permission
   * decision reads, which is `ProjectAccess`.
   */
  role: ScopedRole | null
}

/** Postgres's code for a unique violation — here, a name already in use. */
const UNIQUE_VIOLATION = '23505'

@Injectable()
export class ProjectService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

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
