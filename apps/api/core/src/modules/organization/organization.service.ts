import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, QueryFailedError } from 'typeorm'

import {
  ORGANIZATION_ERROR_CODES,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
} from '@repo/shared'

import { ApiException } from '#shared/http/api-exception'
import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import {
  requireOrgContext,
  requireRequestContext,
  runWithRequestContext,
} from '#shared/org-scope/request-context'

import { AuditService } from '../audit/audit.service'
import { changesBetween } from '../audit/changes'
import { OrganizationMember } from './member.entity'
import { Organization } from './organization.entity'

/** The organisation as a screen needs it. */
export interface OrganizationView {
  id: string
  name: string
  slug: string
}

/** Postgres's code for a unique violation, which is how a slug clash arrives. */
const UNIQUE_VIOLATION = '23505'

@Injectable()
export class OrganizationService {
  constructor(
    // The token names the entity; the `'id'` scope column is set once, on the
    // provider in organization.module.ts.
    @InjectOrgRepository(Organization)
    private readonly orgs: OrgScopedRepository<Organization>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /**
   * The organisation this request is acting for.
   *
   * Not found is a real outcome rather than an impossible one: the guard
   * resolved the org from a membership row, and `ON DELETE CASCADE` does not
   * fire on a soft delete, so a membership of a deleted org outlives it.
   */
  async findActive(): Promise<OrganizationView> {
    const { orgId } = requireOrgContext()
    const organization = await this.orgs.findById(orgId)

    if (!organization || organization.deletedAt !== null) {
      throw ApiException.notFound('Organisation not found')
    }

    return view(organization)
  }

  /** Owner only, enforced by `@RequirePermission` on the route. */
  async update(patch: UpdateOrganizationInput): Promise<OrganizationView> {
    const { orgId } = requireOrgContext()
    const before = await this.orgs.findById(orgId)

    if (!before || before.deletedAt !== null) {
      throw ApiException.notFound('Organisation not found')
    }

    const after = { ...before, ...patch }
    const changes = changesBetween({ ...before }, after)

    // The schema already refuses a body with no fields; this catches a body
    // that names fields holding what they hold. Nothing to write, and an audit
    // row describing no change is worse than none.
    if (Object.keys(changes).length === 0) return view(before)

    await this.dataSource.transaction(async (manager) => {
      try {
        await manager.update(Organization, orgId, {
          ...patch,
          updatedBy: requireRequestContext().userId,
        })
      } catch (error) {
        throw slugClash(error, patch.slug)
      }

      await this.audit.record(manager, {
        entityType: 'organization',
        entityId: orgId,
        action: 'updated',
        changes,
      })
    })

    return view({ ...before, ...patch })
  }

  /**
   * Creates an organisation and makes its creator the owner, together.
   *
   * The two are one transaction because an organisation with no owner is the
   * state the last-owner rule exists to prevent, and a create that committed
   * the row and then failed to insert the membership would produce exactly
   * that — reachable by nobody, deletable by nobody.
   *
   * ⚠️ Runs with **no org in the context**: whoever is creating their first
   * organisation is not a member of one yet, so the route is `@SkipOrgScope()`
   * and `OrgScopedRepository` is unusable here — `requireOrgContext` would
   * throw. The audit row is written inside a context naming the organisation
   * that now exists, which is the org the entry belongs to; writing it under
   * the caller's absent org would mean an `org_id` of null on a NOT NULL
   * column.
   */
  async create(input: CreateOrganizationInput): Promise<OrganizationView> {
    const { userId } = requireRequestContext()

    return this.dataSource.transaction(async (manager) => {
      let created: Organization

      try {
        const inserted = await manager.insert(Organization, {
          name: input.name,
          slug: input.slug,
          createdBy: userId,
          updatedBy: userId,
        })

        created = {
          ...(inserted.generatedMaps[0] as Organization),
          name: input.name,
          slug: input.slug,
        }
      } catch (error) {
        throw slugClash(error, input.slug)
      }

      await manager.insert(OrganizationMember, {
        orgId: created.id,
        userId,
        role: 'owner',
        createdBy: userId,
        updatedBy: userId,
      })

      await runWithRequestContext(
        { orgId: created.id, userId, orgRole: 'owner', sessionId: null },
        () =>
          this.audit.record(manager, {
            entityType: 'organization',
            entityId: created.id,
            action: 'created',
            changes: {
              name: { from: null, to: input.name },
              slug: { from: null, to: input.slug },
            },
          }),
      )

      return view(created)
    })
  }
}

function view(organization: Organization): OrganizationView {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
  }
}

/**
 * A unique violation on the slug index, turned into something the client can
 * act on. Anything else is re-thrown untouched — swallowing it would report a
 * dropped connection as a name that is already taken.
 */
function slugClash(error: unknown, slug: string | undefined): unknown {
  const driver = error instanceof QueryFailedError ? error.driverError : null
  const code = (driver as { code?: string } | null)?.code

  if (code !== UNIQUE_VIOLATION || slug === undefined) return error

  return new ApiException(
    409,
    ORGANIZATION_ERROR_CODES.SLUG_TAKEN,
    `Slug "${slug}" is already taken`,
  )
}
