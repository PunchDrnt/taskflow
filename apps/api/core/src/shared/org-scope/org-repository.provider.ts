import { Inject, type Provider } from '@nestjs/common'
import { getDataSourceToken } from '@nestjs/typeorm'
import type { DataSource, EntityTarget, ObjectLiteral } from 'typeorm'

import {
  createOrgScopedRepository,
  OrgScopedRepository,
} from './org-scoped.repository'

/**
 * Wiring for the one repository services are allowed to inject.
 *
 * `@InjectRepository` is banned under `src/modules/**` by an ESLint rule, so
 * every module needs some way to reach its tables. Rather than have each write
 * its own factory provider — and get the token subtly different — both halves
 * live here.
 */
function tokenFor(entity: EntityTarget<ObjectLiteral>): string {
  const name =
    typeof entity === 'function'
      ? entity.name
      : String((entity as { name?: string }).name ?? entity)

  return `OrgScopedRepository(${name})`
}

/** `providers: [provideOrgRepository(Task)]` */
export function provideOrgRepository(
  entity: EntityTarget<ObjectLiteral>,
  scopeColumn: 'orgId' | 'id' = 'orgId',
): Provider {
  return {
    provide: tokenFor(entity),
    inject: [getDataSourceToken()],
    useFactory: (dataSource: DataSource) =>
      createOrgScopedRepository(dataSource, entity, scopeColumn),
  }
}

/** `constructor(@InjectOrgRepository(Task) private tasks: OrgScopedRepository<Task>)` */
export const InjectOrgRepository = (entity: EntityTarget<ObjectLiteral>) =>
  Inject(tokenFor(entity))

export type { OrgScopedRepository }
