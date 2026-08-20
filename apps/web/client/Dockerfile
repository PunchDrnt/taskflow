# syntax=docker/dockerfile:1
#
# Built from the repository root, not from this directory:
#
#     docker build -f apps/web/client/Dockerfile .
#
# @web/client imports @repo/ui, and Yarn resolves workspaces from the root, so
# a build context narrower than the monorepo cannot install or compile.

ARG NODE_VERSION=24.18.0

FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable
WORKDIR /app

# ── dependencies ─────────────────────────────────────────────────────────────
# Manifests only. Editing a source file must not invalidate this layer, or
# every build re-resolves the whole tree.
FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/core/package.json apps/api/core/
COPY apps/web/client/package.json apps/web/client/
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN yarn install --immutable

# ── build ────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN yarn workspace @web/client build

# ── runtime ──────────────────────────────────────────────────────────────────
# No install here: `output: 'standalone'` already wrote the subset of
# node_modules the server reaches, which is why there is no prod-deps stage
# the way the API has one.
FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

# Ownership set on copy: the standalone server writes nothing, but the image
# should not hand root-owned files to a non-root user either.
# Standalone is written under the app's own .next, but its contents are laid
# out from outputFileTracingRoot — node_modules at the top, server.js still at
# apps/web/client. Copying its root to /app reproduces that.
COPY --from=build --chown=node:node /app/apps/web/client/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/client/.next/static ./apps/web/client/.next/static
COPY --from=build --chown=node:node /app/apps/web/client/public ./apps/web/client/public

USER node
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/client/server.js"]
