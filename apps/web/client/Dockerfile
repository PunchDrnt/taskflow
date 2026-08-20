# syntax=docker/dockerfile:1
#
# Built from the repository root: `docker build -f apps/web/client/Dockerfile .`
# Yarn resolves workspaces there, and @web/client imports @repo/ui.

ARG NODE_VERSION=24.18.0

FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable
WORKDIR /app

# ── dependencies ─────────────────────────────────────────────────────────────
# Every workspace's manifest, including ones this app never imports: yarn.lock
# covers all of them, and leaving one out fails --immutable with YN0028.
FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/core/package.json apps/api/core/
COPY apps/web/client/package.json apps/web/client/
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN yarn install --immutable

# ── build ────────────────────────────────────────────────────────────────────
# Narrow, unlike the manifests: `COPY . .` would rebuild this whenever the
# API changed.
FROM deps AS build
COPY tsconfig.json* turbo.json ./
COPY packages/config packages/config
COPY packages/ui packages/ui
COPY apps/web/client apps/web/client

ENV NEXT_TELEMETRY_DISABLED=1

# Build arguments, not environment: Next inlines NEXT_PUBLIC_* into the bundle
# here, so setting them at container start reports nowhere, silently.
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT="production"
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT}

RUN yarn workspace @web/client build

# ── runtime ──────────────────────────────────────────────────────────────────
# No install: `output: 'standalone'` already wrote the node_modules subset the
# server reaches.
FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

# Standalone lives under the app's .next but is laid out from
# outputFileTracingRoot, so its root maps onto /app.
COPY --from=build --chown=node:node /app/apps/web/client/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/client/.next/static ./apps/web/client/.next/static
COPY --from=build --chown=node:node /app/apps/web/client/public ./apps/web/client/public

USER node
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/client/server.js"]
