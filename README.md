# starter-kit

A Turborepo monorepo starter with a Next.js frontend, a NestJS API, and shared UI/config packages.

## Stack

- **Package manager:** Yarn 4 (Berry, `node-modules` linker)
- **Build system:** [Turborepo](https://turborepo.com)
- **Node:** >=24 (see `.nvmrc`)
- **Web:** Next.js 16, React 19, Tailwind CSS 4
- **API:** NestJS 11, Pino logging, Swagger docs
- **Language:** TypeScript 6
- **Lint/format:** ESLint 10, Prettier 3

## Structure

```
apps/
  web/client/    Next.js app (@web/client)
  api/core/      NestJS API (@api/core)
packages/
  ui/            Shared React component library (@repo/ui)
  config/        Shared eslint/typescript/prettier/tailwind config (@repo/config)
```

Workspaces are resolved via `apps/*/*` and `packages/*`, so each app lives one level deeper than usual (e.g. `apps/web/client`, `apps/api/core`) to leave room for siblings under the same domain.

## Getting started

The Node version is pinned in `.nvmrc`. Yarn does not enforce it, so select it explicitly:

```bash
nvm use          # Node 24.18.0
yarn install
yarn dev
```

- Web app: http://localhost:3000
- API: http://localhost:3001
- API Swagger docs: http://localhost:3001/docs

The API port can be overridden with the `PORT` env var; log level with `LOG_LEVEL` (defaults to `info`, pretty-printed outside of `NODE_ENV=production`).

### Health endpoints

The API exposes [Terminus](https://docs.nestjs.com/recipes/terminus)-backed health checks. All return `200` when healthy and `503` when any indicator reports down.

| Endpoint            | Purpose                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health`       | Full check — all indicators                                                                                                    |
| `GET /health/live`  | Liveness: is the process running? Deliberately checks no dependencies, so a transient outage can't get the container restarted |
| `GET /health/ready` | Readiness: can this instance serve traffic? Add database/cache indicators here as you add them                                 |

Indicators live in [apps/api/core/src/health/health.controller.ts](apps/api/core/src/health/health.controller.ts) — currently heap and RSS memory thresholds.

## Scripts

Run from the repo root, fanned out to every workspace via Turborepo:

| Script              | Description                      |
| ------------------- | -------------------------------- |
| `yarn dev`          | Run all apps in watch mode       |
| `yarn build`        | Build all apps/packages          |
| `yarn lint`         | Lint all workspaces              |
| `yarn check-types`  | Type-check all workspaces        |
| `yarn format`       | Format the repo with Prettier    |
| `yarn format:check` | Check formatting without writing |

Each workspace also exposes its own `dev`/`build`/`lint`/`check-types` scripts if you want to target one package directly, e.g. `yarn workspace @web/client dev`.

## Git hooks

Husky + lint-staged run on every commit: staged files are formatted with Prettier and, for files inside `apps/web/client`, `apps/api/core`, `packages/ui`, and `packages/config`, linted with that workspace's own ESLint config (`--fix`, `--max-warnings 0`). A commit is blocked if a lint issue can't be auto-fixed.

Hooks install automatically the first time you run `yarn install` (via the root `prepare` script) — no manual setup needed.

## Shared packages

- **`@repo/ui`**: React components (Base UI + Tailwind), exported per-component from `src/components/*`. Browse them live in the web app's `/design-system` route.
- **`@repo/config`**: Centralized `eslint/*`, `typescript/*`, `prettier`, and `tailwind/theme.css` configs, consumed by every workspace via `workspace:*` so lint/type/format rules stay consistent across apps.

## Using this as a starter

This repo is meant to be duplicated as the base for new projects. After copying it:

1. Rename the root package and the `@web/client` / `@api/core` / `@repo/*` package names to match the new project.
2. Update `apps/api/core/src/main.ts` (Swagger title/description) and `apps/web/client` metadata.
3. Add a `LICENSE` appropriate for the new project.
4. Wire up CI (lint/check-types/build) for the new repo's forge.
