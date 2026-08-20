import { join } from 'node:path'
import type { DataSourceOptions } from 'typeorm'

import { AuditColumnsSubscriber } from '../shared/audit-columns.subscriber'
import { entities } from './entities'
import { SnakeNamingStrategy } from './snake-naming.strategy'

/**
 * The single description of how this application connects to Postgres,
 * shared by the Nest runtime (`DatabaseModule`) and the TypeORM CLI
 * (`./data-source.ts`), so the two can never drift apart.
 *
 * Deliberately free of side effects: importing it must not read the
 * environment or open a connection.
 */
export function buildDataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,

    // 🔒 Binding: this stays false forever. `synchronize` cannot express a
    // partitioned table, a partial index, `COLLATE "C"` or an extension —
    // all of which this schema depends on — so it would silently build a
    // database that does not match the spec. Every migration is handwritten.
    // See .claude/docs/02-database.md
    synchronize: false,

    // Migrations are applied by an explicit command, never at boot: two
    // instances starting together would otherwise race on the same DDL.
    migrationsRun: false,

    // Entities are written camelCase and mapped to snake_case here, once,
    // rather than with a `@Column({ name })` on every field.
    namingStrategy: new SnakeNamingStrategy(),

    entities,
    // Part of the DataSource rather than a Nest provider, so it applies under
    // the CLI and in tests too — not only where Nest happens to have built it.
    subscribers: [AuditColumnsSubscriber],
    // Migrations are only ever loaded by the CLI, which runs against the
    // compiled output, so a directory glob is safe here in a way it is not
    // for entities (see ./entities.ts).
    migrations: [join(__dirname, 'migrations', '*.js')],
    migrationsTableName: 'migrations',

    logging: ['error', 'warn', 'migration'],
  }
}
