import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import type { Env } from '../config/env'
import { buildDataSourceOptions } from './data-source.options'

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildDataSourceOptions(config.get('DATABASE_URL', { infer: true })),
    }),
  ],
  // AuditColumnsSubscriber is registered through the DataSource options, not
  // here — see data-source.options.ts.
})
export class DatabaseModule {}
