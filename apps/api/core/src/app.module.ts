import { join } from 'node:path'
import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup'
import { LoggerModule } from 'nestjs-pino'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { validateEnv, type Env } from './config/env'
import { DatabaseModule } from './database/database.module'
import { FeatureModule } from './feature/feature.module'
import { HealthModule } from './health/health.module'
import { MaintenanceModule } from './maintenance/maintenance.module'
import { AuditModule } from './modules/audit/audit.module'
import { NotifyModule } from './modules/notify/notify.module'
import { StorageModule } from './modules/storage/storage.module'
import { PermissionModule } from './permission/permission.module'
import { RequestContextMiddleware } from './shared/request-context.middleware'
import { SharedModule } from './shared/shared.module'

// The repo keeps a single .env at its root, shared with docker-compose.
// ConfigModule resolves envFilePath from the process cwd, which is this
// workspace under `yarn dev` but the repo root under `yarn workspace ...`,
// so anchor it to this file instead: src/ (or dist/) is four levels down.
const rootEnvFile = join(__dirname, '..', '..', '..', '..', '.env')

@Module({
  imports: [
    // Inert without a DSN — src/instrument.ts skips Sentry.init entirely, and
    // the filter below then just re-throws.
    SentryModule.forRoot(),
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
    // Notifications only. An audit row must not travel this way: a listener
    // runs after the transaction commits, so a throw there loses the entry
    // with no error anywhere. AuditService.record refuses a manager that is
    // not in a transaction, which makes that mistake fail loudly.
    EventEmitterModule.forRoot(),
    DatabaseModule,
    SharedModule,
    PermissionModule,
    FeatureModule,
    StorageModule,
    AuditModule,
    NotifyModule,
    HealthModule,
    MaintenanceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Reports what nothing else handled. Registered rather than applied in
    // main.ts so it sits below Nest's own filters and does not swallow the
    // HttpExceptions that are ordinary answers.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule implements NestModule {
  // Applied to every route: the context has to exist before any handler runs,
  // and a route that opted out would be a route where org scoping silently
  // stops applying.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*')
  }
}
