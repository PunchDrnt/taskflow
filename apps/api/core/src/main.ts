// First, and above reflect-metadata: Sentry instruments modules as they load,
// so anything imported before it is invisible to it. Its own group in
// packages/config/prettier keeps it there: it is listed in
// importOrderSafeSideEffects, so Prettier sorts it to the top rather than
// treating it as a barrier and leaving whatever lands above it in place.
import './instrument'

import 'reflect-metadata'

import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Logger } from 'nestjs-pino'

import { version as pkgVersion } from '../package.json'
import { AppModule } from './app.module'
import type { Env } from './config/env'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))

  const config = new DocumentBuilder()
    .setTitle('Core API')
    .setDescription('API documentation for apps/api/core')
    // From apps/api/core/package.json, so a release bumps one file rather
    // than a literal here that nothing would notice going stale — this is the
    // only version anyone actually sees. dist/main.js resolves ../package.json
    // to the workspace manifest in dev and in the image alike, since the
    // Dockerfile copies it beside dist and keeps the monorepo layout.
    .setVersion(pkgVersion)
    .build()
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs', app, document)

  const configService: ConfigService<Env, true> = app.get(ConfigService)
  await app.listen(configService.get('PORT', { infer: true }))
}

void bootstrap()
