import {
  IsNull,
  type DataSource,
  type DeepPartial,
  type EntityManager,
  type EntityTarget,
  type FindManyOptions,
  type FindOneOptions,
  type FindOptionsWhere,
  type ObjectLiteral,
  type Repository,
} from 'typeorm'

import { requireRequestContext } from './request-context'
import { OrgQueryBuilders } from './scoped-query-builder'

/**
 * A repository that cannot return another organisation's rows. Reads merge the
 * org into the where clause, writes stamp it, both from the request context
 * rather than an argument a caller could get wrong.
 *
 * The narrow API is the point: add a missing method here, with scoping
 * applied, rather than reaching for the underlying repository.
 *
 * See docs/01-architecture.md#org_id-scoping
 */
export class OrgScopedRepository<T extends ObjectLiteral> {
  constructor(
    private readonly repository: Repository<T>,
    /** `id` for `organization.organizations`, whose org_id would be its own pk. */
    private readonly scopeColumn: 'orgId' | 'id' = 'orgId',
  ) {
    this.queryBuilder = new OrgQueryBuilders(repository, scopeColumn)
  }

  /**
   * For anything the methods below cannot express.
   *
   * ```ts
   * projects.queryBuilder.withOrg('project').andWhere(...)  // scoped
   * users.queryBuilder.base('user')                         // identity has no org
   * ```
   */
  readonly queryBuilder: OrgQueryBuilders<T>

  /** The organisation this repository is currently bound to. */
  get orgId(): string {
    return requireRequestContext().orgId
  }

  private scope(): FindOptionsWhere<T> {
    return { [this.scopeColumn]: this.orgId } as FindOptionsWhere<T>
  }

  /**
   * Merges the org condition into a caller's where clause. An array is OR in
   * TypeORM, so it goes into every branch — once beside the array would widen
   * the query, not narrow it.
   *
   * A branch naming another org is dropped, not overwritten: overwriting
   * answers a different question than the one asked, silently.
   */
  private withScope(
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[] | undefined,
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] | null {
    const branches = Array.isArray(where) ? where : [where ?? {}]

    const scoped = branches
      .filter((branch) => {
        const asked = (branch as Record<string, unknown>)[this.scopeColumn]
        return asked === undefined || asked === this.orgId
      })
      .map((branch) => ({ ...branch, ...this.scope() }))

    // Every branch asked for another org: nothing can match, skip the query.
    if (scoped.length === 0) return null

    return Array.isArray(where) ? scoped : scoped[0]!
  }

  find(options: FindManyOptions<T> = {}): Promise<T[]> {
    const where = this.withScope(options.where)
    if (!where) return Promise.resolve([])

    return this.repository.find({ ...options, where })
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    const where = this.withScope(options.where)
    if (!where) return Promise.resolve(null)

    return this.repository.findOne({ ...options, where })
  }

  findById(id: string): Promise<T | null> {
    return this.findOne({
      where: { id } as unknown as FindOptionsWhere<T>,
    })
  }

  count(options: FindManyOptions<T> = {}): Promise<number> {
    const where = this.withScope(options.where)
    if (!where) return Promise.resolve(0)

    return this.repository.count({ ...options, where })
  }

  exists(options: FindManyOptions<T> = {}): Promise<boolean> {
    const where = this.withScope(options.where)
    if (!where) return Promise.resolve(false)

    return this.repository.exists({ ...options, where })
  }

  /**
   * Empty for an id-scoped repository: `organizations.id` is generated, and
   * forcing it to the current org would collide every new organisation with
   * the one creating it.
   */
  private writeScope(): Partial<T> {
    return this.scopeColumn === 'orgId'
      ? ({ orgId: this.orgId } as unknown as Partial<T>)
      : ({} as Partial<T>)
  }

  /** `org_id` already set, so a caller cannot create a row for someone else. */
  create(data: DeepPartial<T>): T {
    return this.repository.create({
      ...data,
      ...this.writeScope(),
    } as DeepPartial<T>)
  }

  /**
   * Refuses an `id` this organisation does not own.
   *
   * `writeScope()` stamps the org rather than checking it, which is right for
   * a new row and wrong for one that already exists: with an `id` present
   * TypeORM issues `UPDATE ... WHERE id = $1`, so the org stops being a
   * condition and becomes a value being written — saving another org's id
   * moved their row into this one, overwriting it on the way. Measured.
   *
   * Throws rather than reporting nothing saved, unlike `softDeleteById`: a
   * delete matching nothing is a real answer to a fair question, but holding
   * an id from another org means the caller got it somewhere it should not
   * have, and quietly doing nothing hides that.
   */
  async save(entity: DeepPartial<T>): Promise<T> {
    const id = (entity as { id?: string }).id

    // exists() is scoped already, so this covers the id-scoped repository too
    // — organizations had the same hole, one org renaming another.
    if (id !== undefined) {
      const owned = await this.exists({
        where: { id } as unknown as FindOptionsWhere<T>,
      })

      if (!owned) {
        throw new Error(
          `Refusing to save ${id}: it belongs to another organisation, or has ` +
            'been deleted. Load the row through this repository first.',
        )
      }
    }

    return this.repository.save({
      ...entity,
      ...this.writeScope(),
    } as DeepPartial<T>) as Promise<T>
  }

  /**
   * Returns rows affected — 0 for another org's id or a row already deleted,
   * so the caller sees "not found" rather than proof the row exists elsewhere.
   *
   * `deletedBy` is written explicitly because TypeORM's `softDelete()` builds
   * a query without loading the entity, so no subscriber runs and the CHECK on
   * every soft-deletable table rejects the half-set pair. Found by testing.
   *
   * `update()` does not apply the soft-delete filter that reads get, so
   * `deletedAt: IsNull()` is added here — without it a second call rewrites
   * who deleted the row and restarts its ninety-day retention clock.
   *
   * Deletes only this row. Anything belonging to it needs CascadeSoftDelete.
   */
  async softDeleteById(id: string): Promise<number> {
    const { userId } = requireRequestContext()
    const where = this.withScope({
      id,
      deletedAt: IsNull(),
    } as unknown as FindOptionsWhere<T>)
    if (!where) return 0

    const result = await this.repository.update(where, {
      deletedAt: new Date(),
      deletedBy: userId,
      updatedBy: userId,
    } as never)
    return result.affected ?? 0
  }
}

/** Builds one for an entity, picking the right scope column. */
export function createOrgScopedRepository<T extends ObjectLiteral>(
  source: DataSource | EntityManager,
  entity: EntityTarget<T>,
  scopeColumn: 'orgId' | 'id' = 'orgId',
): OrgScopedRepository<T> {
  return new OrgScopedRepository(source.getRepository(entity), scopeColumn)
}
