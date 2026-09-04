import type { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm'

import { requireOrgContext } from './request-context'

/** `identity.*` and `billing.plans` have no `org_id` and so fail this. */
type OrgScoped = { orgId: string }

/** `where` replaces every condition set so far; `orWhere` widens past them. */
type ScopedQueryBuilder<T extends ObjectLiteral> = Omit<
  SelectQueryBuilder<T>,
  'where' | 'orWhere'
>

/**
 * Absent — not merely failing — on an entity with no `orgId`. Before the
 * conditional type, `users.queryBuilder.withOrg()` compiled and then threw
 * `Property "orgId" was not found in "User"` at runtime.
 */
type WithOrg<T extends ObjectLiteral> = T extends OrgScoped
  ? (alias: string) => ScopedQueryBuilder<T>
  : never

/**
 * Makes `where`/`orWhere` throw for the whole chain rather than only the first
 * call: `andWhere` is declared to return `this`, so TypeScript widens back to
 * the full builder at the first hop and the omission above stops holding.
 */
function sealScope<T extends ObjectLiteral>(
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
        // Chaining returns `this` — hand back the proxy so the seal survives.
        return result === target ? proxy : result
      }
    },
  })

  return proxy
}

/**
 * The two ways to get a query builder, and the choice between them — which is
 * the whole reason this type exists rather than a method. `queryBuilder` alone
 * is this object rather than a builder, so no call site ends up with the
 * unscoped one by typing the obvious name: `base` and `withOrg` both have to be
 * asked for, and only one of them is about the org.
 *
 * See docs/01-architecture.md#org_id-scoping
 */
export class QueryBuilders<T extends ObjectLiteral> {
  constructor(
    private readonly repository: Repository<T>,
    private readonly scopeColumn: 'orgId' | 'id',
  ) {}

  /**
   * Unscoped. Correct — not an escape — for the tables with no `org_id`:
   * `identity.*` and `billing.plans`. On a table that has one this crosses
   * orgs, and the call should be able to say why `withOrg` could not do it.
   */
  base(alias: string): SelectQueryBuilder<T> {
    return this.repository.createQueryBuilder(alias)
  }

  /** Scoped to the current org, and sealed against being widened again. */
  withOrg: WithOrg<T> = ((alias: string): ScopedQueryBuilder<T> => {
    const { orgId } = requireOrgContext()

    const builder = this.repository
      .createQueryBuilder(alias)
      .where(`${alias}.${this.scopeColumn} = :__orgId`, { __orgId: orgId })

    return sealScope(builder, alias)
  }) as WithOrg<T>
}
