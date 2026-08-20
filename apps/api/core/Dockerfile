# syntax=docker/dockerfile:1
#
# Built from the repository root, not from this directory:
#
#     docker build -f apps/api/core/Dockerfile .
#
# @api/core imports @repo/shared, and Yarn resolves workspaces from the root,
# so a build context narrower than the monorepo cannot install or compile.

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
# @repo/shared first: it emits the dist/ that @api/core compiles against.
FROM deps AS build
COPY . .
RUN yarn workspace @repo/shared build && yarn workspace @api/core build

# ── production dependencies ──────────────────────────────────────────────────
# A second install rather than a prune, so devDependencies never reach the
# runtime image at all. @swc/core and vitest alone are most of the tree.
FROM deps AS prod-deps
RUN yarn workspaces focus @api/core --production

# ── runtime ──────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production

# The monorepo layout is preserved rather than flattened: node_modules holds a
# symlink to packages/shared, and package.json scripts reach the root by
# relative path. Flattening breaks both.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/core/dist ./apps/api/core/dist
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/core/package.json ./apps/api/core/

USER node
WORKDIR /app/apps/api/core
EXPOSE 3001
CMD ["node", "dist/main.js"]
