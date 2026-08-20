import { join } from 'node:path'
import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { validateEnv, type Env } from './config/env'
import { DatabaseModule } from './database/database.module'
import { HealthModule } from './health/health.module'
import { MaintenanceModule } from './maintenance/maintenance.module'
import { RequestContextMiddleware } from './shared/request-context.middleware'
import { SharedModule } from './shared/shared.module'

// The repo keeps a single .env at its root, shared with docker-compose.
// ConfigModule resolves envFilePath from the process cwd, which is this
// workspace under `yarn dev` but the repo root under `yarn workspace ...`,
// so anchor it to this file instead: src/ (or dist/) is four levels down.
const rootEnvFile = join(__dirname, '..', '..', '..', '..', '.env')

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: rootEnvFile,
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          transport:
            config.get('NODE_ENV', { infer: true }) !== 'production'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    DatabaseModule,
    SharedModule,
    HealthModule,
    MaintenanceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  // Applied to every route: the context has to exist before any handler runs,
  // and a route that opted out would be a route where org scoping silently
  // stops applying.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*')
  }
}
