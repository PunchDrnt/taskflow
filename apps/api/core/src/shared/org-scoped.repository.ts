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
 * A SelectQueryBuilder that cannot drop the org condition.
 *
 * `where` replaces every condition set so far; `orWhere` widens past them.
 * Both would silently unscope a query that looks scoped.
 */
export type ScopedQueryBuilder<T extends ObjectLiteral> = Omit<
  SelectQueryBuilder<T>,
  'where' | 'orWhere'
>

/**
 * Wraps a builder so `where` and `orWhere` throw, at every hop of a chain.
 *
 * The type-level omission only holds for the first call — `andWhere` returns
 * `this`, which TypeScript resolves back to the full builder. Re-wrapping
 * anything a method hands back keeps the guarantee for the rest of the chain.
 */
function guardScopedBuilder<T extends ObjectLiteral>(
  builder: SelectQueryBuilder<T>,
  alias: string,
): ScopedQueryBuilder<T> {
  const proxy: SelectQueryBuilder<T> = new Proxy(builder, {
    get(target, property) {
      if (property === 'where' || property === 'orWhere') {
        return () => {
          throw new Error(
            `${String(property)}() would drop the organisation condition from ` +
              `this query on "${alias}". Use andWhere (with Brackets for OR), ` +
              'or createUnscopedQueryBuilder if the query really must cross orgs.',
          )
        }
      }

      const value = Reflect.get(target, property, target) as unknown
      if (typeof value !== 'function') return value

      return (...args: unknown[]) => {
        const result = (value as (...a: unknown[]) => unknown).apply(
          target,
          args,
        )
        // Builder methods return themselves for chaining; hand back the proxy
        // so the guard survives.
        return result === target ? proxy : result
      }
    },
  })

  return proxy
}

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
   * An array means OR in TypeORM, so the condition goes into every branch —
   * adding it once beside the array would widen the query instead of narrowing
   * it.
   *
   * A branch that names the scope column with some other value is dropped
   * rather than overwritten. Overwriting silently answers a different question
   * than the one asked: `findById(otherOrgId)` on the id-scoped repository
   * would have returned the *current* org, and `find({ where: { orgId: b } })`
   * would have returned org a's rows. Dropping the branch says "no such row",
   * which is both true and what the caller can act on. `null` means unscoped
   * and is left alone.
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

    // Every branch asked for a different org, so nothing can match. Returning
    // null lets callers skip the query entirely.
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
   * The scope to stamp onto a new or saved row.
   *
   * Empty for an id-scoped repository: `organizations.id` is a primary key the
   * database generates, and forcing it to the current org's id would make
   * every created organisation collide with the one creating it.
   */
  private writeScope(): Partial<T> {
    return this.scopeColumn === 'orgId'
      ? ({ orgId: this.orgId } as unknown as Partial<T>)
      : ({} as Partial<T>)
  }

  /**
   * Builds an entity with `org_id` already set, so a caller cannot create a row
   * belonging to someone else by leaving it out or filling it in wrongly.
   */
  create(data: DeepPartial<T>): T {
    return this.repository.create({
      ...data,
      ...this.writeScope(),
    } as DeepPartial<T>)
  }

  save(entity: DeepPartial<T>): Promise<T> {
    return this.repository.save({
      ...entity,
      ...this.writeScope(),
    } as DeepPartial<T>) as Promise<T>
  }

  /**
   * Soft delete, scoped. Returns the number of rows affected, which is 0 when
   * the id belongs to another organisation — the caller sees "not found"
   * rather than an error revealing that the row exists elsewhere.
   *
   * Writes `deletedBy` alongside `deletedAt` explicitly. TypeORM's
   * `softDelete()` builds a query rather than loading the entity, so no
   * subscriber runs and `deletedBy` would stay null — which every
   * soft-deletable table rejects with a CHECK. Found by testing it.
   */
  async softDeleteById(id: string): Promise<number> {
    const { userId } = requireRequestContext()
    const where = this.withScope({ id } as unknown as FindOptionsWhere<T>)
    if (!where) return 0

    const result = await this.repository.update(where, {
      deletedAt: new Date(),
      deletedBy: userId,
      updatedBy: userId,
    } as never)
    return result.affected ?? 0
  }

  /**
   * A query builder with the org condition already applied, and `where` /
   * `orWhere` taken away.
   *
   * Those two are the only way to defeat this class by accident: `.where()`
   * *replaces* every condition set so far, org included, and `.orWhere()`
   * widens past it. `andWhere` and `Brackets` cover everything they were
   * needed for.
   *
   * Guarded twice, because neither alone is enough. The type omits them, which
   * catches the mistake where it is normally made — the first call. But
   * `andWhere` is declared as returning `this`, so the omission does not
   * survive a chain, and a Proxy re-applies it at every hop and throws if
   * either is reached at runtime.
   *
   * Use `createUnscopedQueryBuilder` when a query genuinely has to cross orgs.
   */
  createQueryBuilder(alias: string): ScopedQueryBuilder<T> {
    const builder = this.repository
      .createQueryBuilder(alias)
      .where(`${alias}.${this.scopeColumn} = :__orgId`, { __orgId: this.orgId })

    return guardScopedBuilder(builder, alias)
  }

  /**
   * A query builder with no org condition at all.
   *
   * Named so that it is obvious in review and greppable in the codebase. Every
   * caller should be able to say which org's data it is reaching for and why
   * the scoped builder could not do it — a reporting query spanning orgs, or
   * the Phase 7 back-office. If the answer is "it was easier", it is the wrong
   * method.
   */
  createUnscopedQueryBuilder(alias: string): SelectQueryBuilder<T> {
    return this.repository.createQueryBuilder(alias)
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
