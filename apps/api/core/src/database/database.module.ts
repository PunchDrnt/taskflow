import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import type { Env } from '../config/env'
import { AuditColumnsSubscriber } from '../shared/audit-columns.subscriber'
import { buildDataSourceOptions } from './data-source.options'

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildDataSourceOptions(config.get('DATABASE_URL', { infer: true })),
    }),
  ],
  // Registers itself on the DataSource in its constructor, so it applies to
  // every write through TypeORM rather than only where someone remembered.
  providers: [AuditColumnsSubscriber],
  exports: [AuditColumnsSubscriber],
})
export class DatabaseModule {}
