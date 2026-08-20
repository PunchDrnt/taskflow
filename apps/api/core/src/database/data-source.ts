import { DataSource } from 'typeorm'

import { validateEnv } from '../config/env'
import { buildDataSourceOptions } from './data-source.options'

/**
 * Entry point for the TypeORM CLI, which boots without `ConfigModule` — hence
 * `validateEnv` here, so a bad URL fails the command rather than half-applying
 * a migration.
 *
 * Importing this constructs a DataSource, so nothing in the running app may:
 * `DatabaseModule` builds its options from `ConfigService` instead.
 */
export default new DataSource(
  buildDataSourceOptions(validateEnv(process.env).DATABASE_URL),
)
