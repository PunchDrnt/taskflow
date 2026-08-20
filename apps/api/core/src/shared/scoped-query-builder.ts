import type { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm'

import { requireRequestContext } from './request-context'

/** `identity.*` and `billing.plans` have no `org_id` and so fail this. */
type OrgScoped = { orgId: string }

/** `where` replaces every condition set so far; `orWhere` widens past them. */
export type ScopedQueryBuilder<T extends ObjectLiteral> = Omit<
  SelectQueryBuilder<T>,
  'where' | 'orWhere'
>

/**
 * Makes `where`/`orWhere` throw at every hop of a chain. The type-level
 * omission only holds for the first call — `andWhere` returns `this`, which
 * TypeScript resolves back to the full builder.
 */
function guard<T extends ObjectLiteral>(
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
              'or queryBuilder.base if the query really must cross orgs.',
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
        // Chaining returns `this`; hand back the proxy so the guard survives.
        return result === target ? proxy : result
      }
    },
  })

  return proxy
}

/**
 * Reached as `repository.queryBuilder.withOrg(...)`. Neither shape is the
 * default: `queryBuilder` alone is this object, not a builder, so no call site
 * gets the unscoped one by typing the obvious name.
 */
export class OrgQueryBuilders<T extends ObjectLiteral> {
  constructor(
    private readonly repository: Repository<T>,
    private readonly scopeColumn: 'orgId' | 'id',
  ) {}

  /**
   * The plain TypeORM builder. Correct — not an escape — for the tables with
   * no `org_id`: `identity.*` and `billing.plans`.
   *
   * On a table that has one, this crosses orgs, and the call should be able to
   * say why `withOrg` could not do the job.
   */
  base(alias: string): SelectQueryBuilder<T> {
    return this.repository.createQueryBuilder(alias)
  }

  /**
   * Scoped to the current org. Guarded three ways: the conditional type
   * removes the method from entities with no `orgId` (without it,
   * `users.queryBuilder.withOrg()` threw `Property "orgId" was not found in
   * "User"` at runtime), the return type omits `where`/`orWhere`, and the
   * Proxy covers the rest of the chain.
   */
  withOrg: T extends OrgScoped
    ? (alias: string) => ScopedQueryBuilder<T>
    : never = ((alias: string): ScopedQueryBuilder<T> => {
    const { orgId } = requireRequestContext()

    const builder = this.repository
      .createQueryBuilder(alias)
      .where(`${alias}.${this.scopeColumn} = :__orgId`, { __orgId: orgId })

    return guard(builder, alias)
  }) as T extends OrgScoped ? (alias: string) => ScopedQueryBuilder<T> : never
}
