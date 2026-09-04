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
  type QueryDeepPartialEntity,
  type Repository,
} from 'typeorm'

import { QueryBuilders } from './query-builders'
import { requireOrgContext, requireRequestContext } from './request-context'

/**
 * `FindManyOptions` without `skip`. Lists are ordered by LexoRank `sort_order`,
 * which anyone can insert into the middle of, so an offset page repeats or
 * drops a row; the API convention is cursor paging. `take` is fine.
 */
type ScopedFindManyOptions<T> = Omit<FindManyOptions<T>, 'skip'>

/**
 * A repository that cannot return another organisation's rows. Reads merge the
 * org into the where clause, writes stamp it, both from the request context
 * rather than an argument a caller could get wrong.
 *
 * The narrow API is the point: add a missing method here, with scoping applied,
 * rather than reaching for the underlying repository.
 *
 * See docs/01-architecture.md#org_id-scoping
 */
export class OrgScopedRepository<T extends ObjectLiteral> {
  constructor(
    private readonly repository: Repository<T>,
    /** `id` for `organization.organizations`, whose org_id would be its own pk. */
    private readonly scopeColumn: 'orgId' | 'id' = 'orgId',
  ) {
    this.queryBuilder = new QueryBuilders(repository, scopeColumn)
  }

  /** For anything the methods below cannot express. */
  readonly queryBuilder: QueryBuilders<T>

  /** The organisation this repository is currently bound to. */
  get orgId(): string {
    return requireOrgContext().orgId
  }

  // --- scope -------------------------------------------------------------

  private scope(): FindOptionsWhere<T> {
    return { [this.scopeColumn]: this.orgId } as FindOptionsWhere<T>
  }

  /**
   * The caller's where clause narrowed to this org, or `null` when every branch
   * asked for a different one — nothing can match, so the caller skips the
   * query. An array is OR in TypeORM, hence per branch; a branch naming another
   * org is dropped rather than overwritten, because overwriting would silently
   * answer a different question than the one asked.
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

    if (scoped.length === 0) return null

    return Array.isArray(where) ? scoped : scoped[0]!
  }

  private byId(id: string): FindOptionsWhere<T> {
    return { id } as unknown as FindOptionsWhere<T>
  }

  /** ...and not soft-deleted, which `update()` does not filter on its own. */
  private byLiveId(id: string): FindOptionsWhere<T> {
    return { id, deletedAt: IsNull() } as unknown as FindOptionsWhere<T>
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

  // --- reads -------------------------------------------------------------

  find(options: ScopedFindManyOptions<T> = {}): Promise<T[]> {
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
    return this.findOne({ where: this.byId(id) })
  }

  /**
   * `[rows, total]`, the total counted after scoping — for showing a count, not
   * for paging. See `ScopedFindManyOptions`.
   */
  async findAndCount(
    options: ScopedFindManyOptions<T> = {},
  ): Promise<[T[], number]> {
    const where = this.withScope(options.where)
    if (!where) return [[], 0]

    return this.repository.findAndCount({ ...options, where })
  }

  count(options: ScopedFindManyOptions<T> = {}): Promise<number> {
    const where = this.withScope(options.where)
    if (!where) return Promise.resolve(0)

    return this.repository.count({ ...options, where })
  }

  exists(options: ScopedFindManyOptions<T> = {}): Promise<boolean> {
    const where = this.withScope(options.where)
    if (!where) return Promise.resolve(false)

    return this.repository.exists({ ...options, where })
  }

  // --- writes ------------------------------------------------------------
  //
  // `updateById` and `softDeleteById` both go through TypeORM's `update()`,
  // which loads no entity and applies no soft-delete filter. So both pass
  // `byLiveId` — without it they would edit a deleted row and restart its
  // ninety-day retention clock — and both write the audit columns by hand,
  // since AuditColumnsSubscriber never runs on a query that loaded nothing.

  /** `org_id` already set, so a caller cannot create a row for someone else. */
  create(data: DeepPartial<T>): T {
    return this.repository.create({
      ...data,
      ...this.writeScope(),
    } as DeepPartial<T>)
  }

  /**
   * Refuses an `id` this organisation does not own. `writeScope()` stamps the
   * org rather than checking it, which is right for a new row and wrong for one
   * that exists: with an `id` present TypeORM issues `UPDATE ... WHERE id = $1`,
   * so saving another org's id moved their row into this one, overwriting it on
   * the way. Measured.
   *
   * Throws rather than returning quietly, unlike `softDeleteById`: an id from
   * another org means the caller got it somewhere it should not have.
   */
  async save(entity: DeepPartial<T>): Promise<T> {
    const id = (entity as { id?: string }).id

    // exists() is scoped already, so this covers the id-scoped repository too
    // — organizations had the same hole, one org renaming another.
    if (id !== undefined) {
      const owned = await this.exists({ where: this.byId(id) })

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

  /** Rows affected: 0 for another org's id, or a row already deleted. */
  async updateById(
    id: string,
    patch: QueryDeepPartialEntity<T>,
  ): Promise<number> {
    const { userId } = requireRequestContext()
    const where = this.withScope(this.byLiveId(id))
    if (!where) return 0

    const result = await this.repository.update(where, {
      ...patch,
      updatedBy: userId,
    } as QueryDeepPartialEntity<T>)

    return result.affected ?? 0
  }

  /**
   * Rows affected, so another org's id reads as "not found" rather than as
   * proof the row exists elsewhere. Deletes only this row — anything belonging
   * to it needs CascadeSoftDelete. The CHECK on every soft-deletable table
   * rejects `deletedAt` without `deletedBy`, which is how the missing
   * subscriber above was found.
   */
  async softDeleteById(id: string): Promise<number> {
    const { userId } = requireRequestContext()
    const where = this.withScope(this.byLiveId(id))
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
