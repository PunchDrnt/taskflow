import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, QueryFailedError } from 'typeorm'

import {
  PROJECT_ERROR_CODES,
  type AssignableQuery,
  type ScopedRole,
} from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { requireOrgContext } from '#shared/org-scope/request-context'

import { AuditService } from '../audit/audit.service'
import { ACTIVE_USER_STATUS, UserService } from '../iam/user/user.service'
import { MemberService } from '../organization/member.service'
import { ProjectMember } from './project-member.entity'
import { ProjectService } from './project.service'

/** One row of a project's member list, before names are attached. */
export interface ProjectMemberRow {
  userId: string
  role: ScopedRole
  /** `created_at` under the name this screen gives it. */
  joinedAt: Date
}

/** One person the assignee picker may offer. */
export interface AssignableUser {
  userId: string
  name: string
  nickname: string
  email: string
  avatarUrl: string | null
  /** False means picking them will ask to add them to the project first. */
  inProject: boolean
}

const UNIQUE_VIOLATION = '23505'

/** How many rows the picker shows before asking the person to type more. */
const ASSIGNABLE_LIMIT = 20

/**
 * Who is in a project. Independent of teams — somebody joins a project the way
 * they join a Slack channel, which is why this is its own table rather than a
 * view over `organization.team_members`.
 *
 * Every method starts at `ProjectService.requireProject`, so the caller has to
 * be able to see the project before they can ask anything about its members,
 * and to be allowed to change it before they can change them.
 *
 * There is deliberately **no last-admin rule** here, unlike the organisation's
 * last-owner one. A project with no admins left is still fully administrable
 * by the organisation's owners and admins — who see every project for exactly
 * this reason — so it cannot become unreachable the way an ownerless
 * organisation can.
 */
@Injectable()
export class ProjectMemberService {
  constructor(
    @InjectOrgRepository(ProjectMember)
    private readonly members: OrgScopedRepository<ProjectMember>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly projects: ProjectService,
    private readonly orgMembers: MemberService,
    private readonly users: UserService,
    private readonly audit: AuditService,
  ) {}

  async list(projectId: string): Promise<ProjectMemberRow[]> {
    // Seeing the project is the whole requirement: anyone who may open it may
    // see who else is in it.
    await this.projects.findVisible(projectId)

    return this.members.queryBuilder
      .withOrg('member')
      .select('member.user_id', 'userId')
      .addSelect('member.role', 'role')
      .addSelect('member.created_at', 'joinedAt')
      .andWhere('member.projectId = :projectId', { projectId })
      .orderBy('member.created_at', 'ASC')
      .getRawMany<ProjectMemberRow>()
  }

  /**
   * Adds somebody to the project.
   *
   * 🔒 **The target must already be in the organisation, checked here.** The
   * database will not catch it: `project.members.user_id` references
   * `iam.users(id)` alone, while `project_id` is the composite
   * `(project_id, org_id)` — so the row's org can never disagree with the
   * project's, but the *person* named can be anybody with an account. Insert
   * a user from another company and they hold a real membership of this
   * project, which `ProjectService.list` then honours.
   *
   * This is the one place where "the FK looks like it covers it" is wrong, and
   * it is wrong quietly.
   */
  async add(
    projectId: string,
    userId: string,
    role: ScopedRole,
  ): Promise<ProjectMemberRow> {
    const { userId: actorId } = requireOrgContext()

    await this.projects.requireProject(projectId, 'update')

    if (!(await this.orgMembers.findByUserId(userId))) {
      // Not "forbidden": from this organisation's side the person is simply
      // not here, and saying otherwise confirms that an account exists.
      throw ApiException.notFound('No such person in this organisation')
    }

    return this.dataSource.transaction(async (manager) => {
      const row = {
        orgId: this.members.orgId,
        projectId,
        userId,
        role,
        createdBy: actorId,
        updatedBy: actorId,
      }

      let created: ProjectMember

      try {
        const inserted = await manager.insert(ProjectMember, row)

        created = { ...(inserted.generatedMaps[0] as ProjectMember), ...row }
      } catch (error) {
        throw alreadyMember(error)
      }

      await this.audit.record(manager, {
        entityType: 'project_member',
        entityId: created.id,
        action: 'created',
        changes: {
          projectId: { from: null, to: projectId },
          userId: { from: null, to: userId },
          role: { from: null, to: role },
        },
      })

      return { userId, role, joinedAt: created.createdAt }
    })
  }

  async changeRole(
    projectId: string,
    userId: string,
    next: ScopedRole,
  ): Promise<ProjectMemberRow> {
    await this.projects.requireProject(projectId, 'update')

    const member = await this.find(projectId, userId)
    if (!member) throw ApiException.notFound('No such member in this project')

    if (member.role === next) {
      return { userId, role: next, joinedAt: member.createdAt }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(ProjectMember, member.id, {
        role: next,
        updatedAt: new Date(),
        updatedBy: requireOrgContext().userId,
      })

      await this.audit.record(manager, {
        entityType: 'project_member',
        entityId: member.id,
        action: 'updated',
        changes: { role: { from: member.role, to: next } },
      })
    })

    return { userId, role: next, joinedAt: member.createdAt }
  }

  /**
   * Takes somebody out of the project.
   *
   * A hard `DELETE`, and correctly so: `project.members` extends
   * `OrgScopedEntity` and carries no `deleted_at`, because a membership that
   * ended leaves nothing anybody needs to read back — the work the person did
   * is on the tasks, attributed by `created_by`, and stays there. The three
   * questions in docs/02-database/rules.md#base-entity give this answer.
   */
  async remove(projectId: string, userId: string): Promise<void> {
    await this.projects.requireProject(projectId, 'update')

    const member = await this.find(projectId, userId)
    if (!member) throw ApiException.notFound('No such member in this project')

    await this.dataSource.transaction(async (manager) => {
      // Written before the delete: the audit row names the id, and reading it
      // back afterwards would find nothing.
      await this.audit.record(manager, {
        entityType: 'project_member',
        entityId: member.id,
        action: 'deleted',
        changes: {
          projectId: { from: projectId, to: null },
          userId: { from: userId, to: null },
          role: { from: member.role, to: null },
        },
      })

      await manager.delete(ProjectMember, {
        id: member.id,
        orgId: this.members.orgId,
      })
    })
  }

  /**
   * Who this project can hand work to, for the assignee picker.
   *
   * Two tiers, queried one at a time: `project` — nearly always the answer —
   * and `org` behind the picker's "search the whole organisation" button. The
   * middle tier the original specification had, "people you assigned
   * recently", was cut in the docs before this was written: it is the most
   * expensive query on the most frequently opened screen, spent reordering
   * something the first tier already answers.
   *
   * **Names come from `UserService`, never from a join** — `iam.users` is not
   * this module's table, and it has no `org_id` to scope by. The consequence
   * is that `q` is matched in memory rather than in SQL, over the people in
   * one organisation: a hundred rows here, a few thousand in the largest
   * customer this design is aimed at. When that stops being true the fix is a
   * search endpoint on `iam`, not a cross-schema join here.
   *
   * Nickname is searched alongside the real name because Thai colleagues go by
   * it — a picker that only matched `name` would fail to find the person by
   * the only thing anybody calls them.
   */
  async assignable(
    projectId: string,
    query: AssignableQuery,
  ): Promise<AssignableUser[]> {
    await this.projects.findVisible(projectId)

    const inProject = new Set(
      (await this.list(projectId)).map((member) => member.userId),
    )

    const candidates =
      query.scope === 'project'
        ? [...inProject]
        : (await this.orgMembers.list()).map((member) => member.userId)

    const people = await this.users.findByIds(candidates)
    const needle = query.q?.toLowerCase() ?? ''

    return people
      .filter(
        (person) =>
          // A deactivated colleague may not be given new work, so the picker
          // does not offer them. They stay in the members list, which is a
          // different screen answering a different question.
          person.status === ACTIVE_USER_STATUS &&
          (needle === '' ||
            [person.name, person.nickname, person.email, person.username].some(
              (field) => field.toLowerCase().includes(needle),
            )),
      )
      .sort(
        (a, b) =>
          // People already in the project first, then alphabetically — the
          // two tiers, in one list, for the `org` scope that mixes them.
          Number(inProject.has(b.id)) - Number(inProject.has(a.id)) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, ASSIGNABLE_LIMIT)
      .map((person) => ({
        userId: person.id,
        name: person.name,
        nickname: person.nickname,
        email: person.email,
        avatarUrl: person.avatarUrl,
        inProject: inProject.has(person.id),
      }))
  }

  /** The membership row, scoped to this org by the repository. */
  find(projectId: string, userId: string): Promise<ProjectMember | null> {
    return this.members.queryBuilder
      .withOrg('member')
      .andWhere('member.projectId = :projectId', { projectId })
      .andWhere('member.userId = :userId', { userId })
      .getOne()
  }
}

/** A unique violation on `(project_id, user_id)`, which is a duplicate add. */
function alreadyMember(error: unknown): unknown {
  const driver = error instanceof QueryFailedError ? error.driverError : null

  if ((driver as { code?: string } | null)?.code !== UNIQUE_VIOLATION) {
    return error
  }

  return new ApiException(
    409,
    PROJECT_ERROR_CODES.ALREADY_MEMBER,
    'That person is already in this project',
  )
}
