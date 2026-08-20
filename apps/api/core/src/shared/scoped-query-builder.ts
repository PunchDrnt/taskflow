import type { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm'

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
   * Scoped to the current org, with `where` and `orWhere` taken away.
   *
   * Those two are the only way to unscope a query by accident. `andWhere` and
   * `Brackets` cover everything they were needed for.
   *
   * Guarded twice, because neither half is enough alone: the type omits them,
   * which catches the mistake where it is normally made — the first call —
   * and the Proxy holds for the rest of the chain, where the type does not.
   */
  withOrg(alias: string): ScopedQueryBuilder<T> {
    const { orgId } = requireRequestContext()

    const builder = this.repository
      .createQueryBuilder(alias)
      .where(`${alias}.${this.scopeColumn} = :__orgId`, { __orgId: orgId })

    return guard(builder, alias)
  }

  /**
   * No org condition at all.
   *
   * Named after the same idea as `@SkipOrgScope()`, so the two read as one
   * decision at different layers. Every caller should be able to say why the
   * scoped builder could not do the job — a report spanning orgs, or the
   * Phase 7 back-office. If the answer is "it was easier", it is the wrong one.
   */
  withoutOrg(alias: string): SelectQueryBuilder<T> {
    return this.repository.createQueryBuilder(alias)
  }
}
