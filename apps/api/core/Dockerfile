# syntax=docker/dockerfile:1
#
# Built from the repository root: `docker build -f apps/api/core/Dockerfile .`
# Yarn resolves workspaces there, and @api/core imports @repo/shared.

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
# web app changed.
FROM deps AS build
COPY tsconfig.json* turbo.json ./
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY apps/api/core apps/api/core
# @repo/shared first — it emits the dist/ that @api/core compiles against.
RUN yarn workspace @repo/shared build && yarn workspace @api/core build

# ── production dependencies ──────────────────────────────────────────────────
# A second install rather than a prune: @swc/core and vitest never reach the
# runtime image at all.
FROM deps AS prod-deps
RUN yarn workspaces focus @api/core --production

# ── runtime ──────────────────────────────────────────────────────────────────
# Layout preserved, not flattened: node_modules holds a symlink to
# packages/shared, and scripts reach the root by relative path.
FROM base AS runner
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/core/dist ./apps/api/core/dist
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/core/package.json ./apps/api/core/

USER node
WORKDIR /app/apps/api/core
EXPOSE 4001
CMD ["node", "dist/main.js"]
