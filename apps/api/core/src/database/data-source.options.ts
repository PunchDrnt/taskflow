import { join } from 'node:path'
import type { DataSourceOptions } from 'typeorm'

import { AuditColumnsSubscriber } from '#shared/entity/audit-columns.subscriber'

import { entities } from './entities'
import { SnakeNamingStrategy } from './snake-naming.strategy'

/**
 * Shared by the Nest runtime and the TypeORM CLI so the two cannot drift.
 * Free of side effects: importing must not read the environment or connect.
 */
export function buildDataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,

    // 🔒 Binding, forever. `synchronize` cannot express a partitioned table, a
    // partial index, `COLLATE "C"` or an extension — all of which this schema
    // needs — so it would quietly build the wrong database.
    synchronize: false,

    // Never at boot: two instances starting together would race on the DDL.
    migrationsRun: false,

    // camelCase → snake_case once, not `@Column({ name })` on every field.
    namingStrategy: new SnakeNamingStrategy(),

    entities,
    // Here rather than a Nest provider, so it applies under the CLI and in
    // tests too.
    subscribers: [AuditColumnsSubscriber],
    // Only the CLI loads these, always from compiled output, so a glob is safe
    // here in a way it is not for entities (see ./entities.ts).
    migrations: [join(__dirname, 'migrations', '*.js')],
    migrationsTableName: 'migrations',

    logging: ['error', 'warn', 'migration'],
  }
}
