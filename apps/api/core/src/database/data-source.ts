import { DataSource } from 'typeorm'

import { validateEnv } from '../config/env'
import { buildDataSourceOptions } from './data-source.options'

/**
 * Entry point for the TypeORM CLI, which boots without Nest and therefore
 * without `ConfigModule`. It still goes through `validateEnv`, so a bad
 * `DATABASE_URL` fails the command instead of half-applying a migration.
 *
 * Constructing the DataSource is a side effect of importing this file, so
 * nothing in the running application may import it — the app builds its
 * options from `ConfigService` via `DatabaseModule` instead. That is the
 * whole reason `buildDataSourceOptions` lives in its own module.
 */
export default new DataSource(
  buildDataSourceOptions(validateEnv(process.env).DATABASE_URL),
)
