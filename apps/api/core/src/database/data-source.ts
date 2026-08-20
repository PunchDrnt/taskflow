import { DataSource } from 'typeorm'

import { validateDatabaseUrl } from '../config/env'
import { buildDataSourceOptions } from './data-source.options'

/**
 * Entry point for the TypeORM CLI, which boots without `ConfigModule` — hence
 * the validation here, so a bad URL fails the command rather than
 * half-applying a migration.
 *
 * The URL alone, not the whole schema: a migration container that has to carry
 * a Resend key and S3 credentials to run is one more thing to get wrong during
 * a deploy, and none of it is read.
 *
 * Importing this constructs a DataSource, so nothing in the running app may:
 * `DatabaseModule` builds its options from `ConfigService` instead.
 */
export default new DataSource(
  buildDataSourceOptions(validateDatabaseUrl(process.env)),
)
