import type { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm'

import { requireRequestContext } from './request-context'

/**
 * An entity with an `org_id` column. `identity.*` and `billing.plans` do not
 * have one — they belong to the whole system rather than to an org — so
 * `withOrg` is unavailable on them by type rather than failing at runtime.
 */
type OrgScoped = { orgId: string }

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
              'or queryBuilder.withoutOrg if the query really must cross orgs.',
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
 * The query builders an OrgScopedRepository offers, in the two shapes there
 * are. Reached as `repository.queryBuilder.withOrg(...)`.
 *
 * Neither is the default — `repository.queryBuilder` on its own is this
 * object, not a builder, so every call site has to say which one it means and
 * nothing gets the unscoped one by typing the obvious name.
 *
 * Lives apart from OrgScopedRepository because it shares none of that class's
 * state beyond the repository itself, and because the guard above is worth
 * reading without the CRUD surface around it.
 */
export class OrgQueryBuilders<T extends ObjectLiteral> {
  constructor(
    private readonly repository: Repository<T>,
    private readonly scopeColumn: 'orgId' | 'id',
  ) {}

  /**
   * The plain TypeORM builder, with nothing applied.
   *
   * Correct, not an escape, for the tables that have no `org_id` at all — the
   * whole `identity` schema and `billing.plans`. A user profile is not scoped
   * to an org because a user belongs to several.
   *
   * On a table that *does* have `org_id`, this crosses orgs, and every such
   * call should be able to say why `withOrg` could not do the job — a report
   * spanning orgs, or the Phase 7 back-office. If the answer is "it was
   * easier", it is the wrong one.
   */
  base(alias: string): SelectQueryBuilder<T> {
    return this.repository.createQueryBuilder(alias)
  }

  /**
   * Scoped to the current org, with `where` and `orWhere` taken away.
   *
   * Those two are the only way to unscope a query by accident. `andWhere` and
   * `Brackets` cover everything they were needed for.
   *
   * Guarded three ways. The conditional type below removes this method
   * entirely from entities with no `orgId`, so `users.queryBuilder.withOrg()`
   * does not compile — without it, it threw at runtime with `Property "orgId"
   * was not found in "User"`. The returned type omits `where`/`orWhere`, which
   * catches the usual mistake on the first call. And a Proxy holds for the
   * rest of the chain, where the type stops helping because `andWhere` is
   * declared as returning `this`.
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
