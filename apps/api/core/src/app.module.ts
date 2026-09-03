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

import { ApiExceptionFilter } from '#shared/http/api-exception.filter'
import { RequestContextMiddleware } from '#shared/org-scope/request-context.middleware'
import { SharedModule } from '#shared/shared.module'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { validateEnv, type Env } from './config/env'
import { DatabaseModule } from './database/database.module'
import { FeatureModule } from './feature/feature.module'
import { HealthModule } from './health/health.module'
import { MaintenanceModule } from './maintenance/maintenance.module'
import { AuditModule } from './modules/audit/audit.module'
import { AuthModule } from './modules/identity/auth/auth.module'
import { UserModule } from './modules/identity/user/user.module'
import { NotifyModule } from './modules/notify/notify.module'
import { OrganizationModule } from './modules/organization/organization.module'
import { StorageModule } from './modules/storage/storage.module'
import { PermissionModule } from './permission/permission.module'

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
    AuthModule,
    UserModule,
    OrganizationModule,
    NotifyModule,
    HealthModule,
    MaintenanceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // These two are ordered, not merely listed. APP_FILTER is applied in
    // reverse — last registered is tried first — so ApiExceptionFilter sees
    // every HttpException, and Sentry's @Catch() filter gets what is left:
    // the unexpected errors it exists to report. Swap them and Nest's own 404
    // loses its `code`, which is what api-exception.filter.spec.ts checks.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
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
