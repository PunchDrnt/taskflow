// First, and above reflect-metadata: Sentry instruments modules as they load,
// so anything imported before it is invisible to it. Its own group in
// packages/config/prettier keeps it there: it is listed in
// importOrderSafeSideEffects, so Prettier sorts it to the top rather than
// treating it as a barrier and leaving whatever lands above it in place.
import './instrument'

import 'reflect-metadata'

import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import cookieParser from 'cookie-parser'
import { Logger } from 'nestjs-pino'

import { version as pkgVersion } from '../package.json'
import { AppModule } from './app.module'
import type { Env } from './config/env'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  })
  app.useLogger(app.get(Logger))

  // One hop: Caddy, and nothing else is allowed to reach this port. Without
  // it `request.ip` is Caddy's own container address, so every session row
  // would record the proxy rather than the client — and `Secure` cookies
  // would be decided from a protocol Express thinks is always http.
  app.set('trust proxy', 1)

  // Auth reads three cookies and never a header, so nothing authenticates
  // without this. Before setGlobalPrefix only for readability — it applies to
  // every request either way.
  app.use(cookieParser())

  // 'v1', not 'api/v1'. Caddy's `handle_path /api/*` has already stripped the
  // prefix by the time a request arrives, so adding it here would make every
  // route /api/api/v1/... from the browser's side.
  //
  // ⚠️ health is excluded because deploy/compose.yml's healthcheck hits
  // 127.0.0.1:3001/health/live *directly*, bypassing Caddy. Move it under the
  // prefix and the container reports unhealthy, which stops `web` and `caddy`
  // from starting at all — and no Caddy runs locally, so nothing catches it
  // before a deploy. `docs` is excluded for the same reason it is served at a
  // fixed path: it is not a versioned API surface.
  app.setGlobalPrefix('v1', {
    exclude: ['health', 'health/live', 'health/ready'],
  })

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
