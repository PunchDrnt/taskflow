import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm'

import {
  PROJECT_ERROR_CODES,
  type CreateProjectInput,
  type ListProjectsQuery,
  type ScopedRole,
  type UpdateProjectInput,
} from '@repo/shared'

import { CascadeSoftDelete } from '#shared/entity/cascade-soft-delete'
import { ApiException } from '#shared/http/api-exception'
import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { requireOrgContext } from '#shared/org-scope/request-context'
import { sequence } from '#shared/sort-order'

import type { Action } from '../../permission/ability'
import { actorForProject, actorFromContext } from '../../permission/actor'
import { PermissionService } from '../../permission/permission.service'
import { AuditService } from '../audit/audit.service'
import { changesBetween } from '../audit/changes'
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
    private readonly cascade: CascadeSoftDelete,
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
    if (
      !this.permissions.can(actorForProject(role, id), 'read', 'Project', {
        id,
      })
    ) {
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

    this.permissions.assert(
      actorForProject(visible.role, id),
      action,
      'Project',
      {
        id,
      },
    )

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

  /**
   * Renames a project, or changes its colour, description or key prefix.
   *
   * Changing `key_prefix` re-keys every task in the project at once — `DEV-120`
   * becomes `OPS-120` the moment this commits — and that is the design, not an
   * oversight: the key is composed at display time from the prefix and
   * `tasks.number`, never stored, so there is nothing to backfill. What it
   * costs is that a key someone pasted into chat last week now reads
   * differently. docs/04-features/phase-1.md#task-key accepts that.
   *
   * Archiving is not here — it is its own endpoint, so that "rename this
   * project" and "hide it from everyone's sidebar" cannot arrive as the same
   * request with one extra field.
   */
  async update(id: string, patch: UpdateProjectInput): Promise<ProjectView> {
    const { project, role } = await this.requireProject(id, 'update')

    const after = { ...project, ...patch }
    const changes = changesBetween({ ...project }, after)

    // The schema already refuses a body with no fields; this catches a body
    // whose fields hold what they already hold. An audit row describing no
    // change is worse than none.
    if (Object.keys(changes).length === 0) return view(project, role)

    await this.dataSource.transaction(async (manager) => {
      try {
        await manager.update(Project, id, {
          ...patch,
          updatedBy: requireOrgContext().userId,
        })
      } catch (error) {
        throw nameClash(error, patch.name)
      }

      await this.audit.record(manager, {
        entityType: 'project',
        entityId: id,
        action: 'updated',
        changes,
      })
    })

    return view(after as Project, role)
  }

  /**
   * Hides a project from the sidebar and from every picker, without taking
   * anything away.
   *
   * ⚠️ **`archived_at` is not `deleted_at`.** Members keep their access and
   * the history stays readable — which is why the column has no `archived_by`
   * beside it and no CHECK pairing the two, unlike every soft-delete column in
   * this schema. Confusing the two is how "we archived it" turns into "where
   * did our tasks go".
   */
  async setArchived(id: string, archived: boolean): Promise<ProjectView> {
    const { project, role } = await this.requireProject(id, 'update')

    if ((project.archivedAt !== null) === archived) return view(project, role)

    const archivedAt = archived ? new Date() : null

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Project, id, {
        archivedAt,
        updatedBy: requireOrgContext().userId,
      })

      await this.audit.record(manager, {
        entityType: 'project',
        // Its own action rather than an `updated` row with one field in it:
        // this is the entry somebody scans the log for.
        action: archived ? 'archived' : 'unarchived',
        entityId: id,
        changes: { archivedAt: { from: project.archivedAt, to: archivedAt } },
      })
    })

    return view({ ...project, archivedAt }, role)
  }

  /**
   * Soft-deletes the project and everything under it — statuses, sprints,
   * tasks and their sub-tasks, comments, attachments, views.
   *
   * Through `CascadeSoftDelete` rather than `softDeleteById`, because
   * `ON DELETE CASCADE` fires only on a hard delete: without it the tasks
   * outlive the project, keep showing up in every list that reads tasks
   * directly, and then jam the retention purge ninety days later, since
   * `tasks.project_id` is RESTRICT.
   *
   * The cascade and the audit row share this transaction, which is what the
   * manager parameter on both is for.
   */
  async remove(id: string): Promise<void> {
    const { project } = await this.requireProject(id, 'delete')

    await this.dataSource.transaction(async (manager) => {
      const deleted = await this.cascade.softDelete(
        manager,
        'project.projects',
        id,
      )

      await this.audit.record(manager, {
        entityType: 'project',
        entityId: id,
        action: 'deleted',
        changes: {
          name: { from: project.name, to: null },
          // What went with it, so the log answers "and the tasks?" without
          // anybody having to reason about the cascade map.
          cascaded: { from: null, to: deleted },
        },
      })
    })
  }

  /**
   * Hands out the next task number for a project, in the caller's transaction.
   *
   * 🔒 **A counter on the project row, incremented in the statement that reads
   * it — never `MAX(number) + 1`.** The two differ the moment a task is
   * deleted: `MAX + 1` reissues the top number immediately, and a number that
   * comes back is worse than a broken link. People paste `DEV-87` into chat
   * and into commit messages; the day that key resolves to a different piece
   * of work, every one of those references is quietly wrong, and there is
   * nothing in the data to notice it by. `tasks_project_number_unique` is a
   * *full* index rather than the partial one every other soft-deleted table
   * gets, for the same reason and pointing the same way: a deleted task keeps
   * its number forever.
   *
   * Returning the pre-increment value from the `UPDATE` itself is what makes
   * it safe under concurrency. Two people filing a task in the same project at
   * the same moment serialise on this row — the second blocks until the first
   * commits, then reads what the first left — so neither can be handed a
   * number the other already took. A `SELECT` followed by an `UPDATE` would be
   * the read-then-write race `MemberService.changeRole` and
   * `SessionService.rotate` both avoid, and here it would fail loudly, on the
   * unique index, in whichever request lost.
   *
   * The lock is held for the rest of the create, which serialises task
   * creation per project. That is the cost of the guarantee and it is small:
   * the transaction is one insert long, and the contention is per project
   * rather than per organisation.
   *
   * The caller must have established that they may touch the project — this
   * takes an id, not a permission.
   */
  async allocateTaskNumber(
    manager: EntityManager,
    projectId: string,
  ): Promise<number> {
    // TypeORM's postgres driver returns `[rows, affected]` for an UPDATE, even
    // one with RETURNING — the rows are the first element, not the result.
    const [rows] = (await manager.query(
      `UPDATE project.projects
          SET next_task_number = next_task_number + 1
        WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
        RETURNING next_task_number - 1 AS number`,
      [projectId, this.projects.orgId],
    )) as [{ number: number }[], number]

    const allocated = rows[0]?.number

    if (allocated === undefined) throw notFound()

    return allocated
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
