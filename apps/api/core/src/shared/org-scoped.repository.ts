import {
  type DataSource,
  type DeepPartial,
  type EntityManager,
  type EntityTarget,
  type FindManyOptions,
  type FindOneOptions,
  type FindOptionsWhere,
  type ObjectLiteral,
  type Repository,
  type SelectQueryBuilder,
} from 'typeorm'

import { requireRequestContext } from './request-context'

/**
 * A repository that cannot return another organisation's rows.
 *
 * Every read merges `org_id = <current org>` into the where clause and every
 * write stamps it, taking the value from the request context rather than from
 * an argument a caller could get wrong. Services use this instead of injecting
 * `Repository<T>`, which has no such guarantee — an ESLint rule enforces that.
 *
 * The API is deliberately narrow. TypeORM's Repository has dozens of methods
 * and several ways out through raw SQL; wrapping it and exposing only what is
 * safe is the point, so a missing method should be added here with scoping
 * applied rather than worked around by reaching for the underlying repository.
 *
 * See .claude/docs/01-architecture.md#org_id-scoping
 */
export class OrgScopedRepository<T extends ObjectLiteral> {
  constructor(
    private readonly repository: Repository<T>,
    /**
     * The column holding the organisation id.
     *
     * `organization.organizations` is the one table where this is `id`: its
     * `org_id` would always equal its own primary key, so the column does not
     * exist. See .claude/docs/02-database.md#3-multi-tenancy
     */
    private readonly scopeColumn: 'orgId' | 'id' = 'orgId',
  ) {}

  /** The organisation this repository is currently bound to. */
  get orgId(): string {
    return requireRequestContext().orgId
  }

  private scope(): FindOptionsWhere<T> {
    return { [this.scopeColumn]: this.orgId } as FindOptionsWhere<T>
  }

  /**
   * Merges the org condition into a caller's where clause.
   *
   * An array means OR in TypeORM, so the condition has to go into every branch
   * — adding it once beside the array would widen the query instead of
   * narrowing it.
   */
  private withScope(
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[] | undefined,
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    if (Array.isArray(where)) {
      return where.map((branch) => ({ ...branch, ...this.scope() }))
    }
    return { ...(where ?? {}), ...this.scope() }
  }

  find(options: FindManyOptions<T> = {}): Promise<T[]> {
    return this.repository.find({
      ...options,
      where: this.withScope(options.where),
    })
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repository.findOne({
      ...options,
      where: this.withScope(options.where),
    })
  }

  findById(id: string): Promise<T | null> {
    return this.findOne({
      where: { id } as unknown as FindOptionsWhere<T>,
    })
  }

  count(options: FindManyOptions<T> = {}): Promise<number> {
    return this.repository.count({
      ...options,
      where: this.withScope(options.where),
    })
  }

  exists(options: FindManyOptions<T> = {}): Promise<boolean> {
    return this.repository.exists({
      ...options,
      where: this.withScope(options.where),
    })
  }

  /**
   * Builds an entity with `org_id` already set, so a caller cannot create a row
   * belonging to someone else by leaving it out or filling it in wrongly.
   */
  create(data: DeepPartial<T>): T {
    return this.repository.create({
      ...data,
      ...this.scope(),
    } as DeepPartial<T>)
  }

  save(entity: DeepPartial<T>): Promise<T> {
    return this.repository.save({
      ...entity,
      ...this.scope(),
    } as DeepPartial<T>) as Promise<T>
  }

  /**
   * Soft delete, scoped. Returns the number of rows affected, which is 0 when
   * the id belongs to another organisation — the caller sees "not found"
   * rather than an error revealing that the row exists elsewhere.
   */
  async softDeleteById(id: string): Promise<number> {
    const result = await this.repository.softDelete({
      id,
      ...this.scope(),
    } as unknown as FindOptionsWhere<T>)
    return result.affected ?? 0
  }

  /**
   * A query builder with the org condition already applied.
   *
   * ⚠️ Chain with `andWhere`. Calling `.where()` on the returned builder
   * *replaces* the org condition, which is the one way to defeat this class by
   * accident.
   */
  createQueryBuilder(alias: string): SelectQueryBuilder<T> {
    return this.repository
      .createQueryBuilder(alias)
      .where(`${alias}.${this.scopeColumn} = :__orgId`, { __orgId: this.orgId })
  }
}

/**
 * Builds an OrgScopedRepository for an entity, picking the right scope column.
 */
export function createOrgScopedRepository<T extends ObjectLiteral>(
  source: DataSource | EntityManager,
  entity: EntityTarget<T>,
  scopeColumn: 'orgId' | 'id' = 'orgId',
): OrgScopedRepository<T> {
  return new OrgScopedRepository(source.getRepository(entity), scopeColumn)
}
