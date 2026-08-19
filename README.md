# taskflow

An internal task-tracking system — built so the team actually updates it, rather than losing work in chat threads.

Roughly 20 daily users out of a ~100-person company, built part-time by the people who use it, deployed on a server in Thailand. The data model is designed so it could become a multi-tenant SaaS later without a rewrite.

## Documentation

The full specification lives in [`.claude/docs/`](.claude/docs/) — written in Thai, with English headings.

|                                                         |                                                                             |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`00-overview.md`](.claude/docs/00-overview.md)         | Start here — the problem, glossary, decision principles, and what's binding |
| [`01-architecture.md`](.claude/docs/01-architecture.md) | Stack, module boundaries, API/naming/auth conventions                       |
| [`02-database.md`](.claude/docs/02-database.md)         | Every table and field, FK rules, `org_id` scoping                           |
| [`03-roadmap.md`](.claude/docs/03-roadmap.md)           | What ships in which phase, feature priorities                               |
| [`04-features.md`](.claude/docs/04-features.md)         | Detailed spec for each feature                                              |
| [`05-saas-notes.md`](.claude/docs/05-saas-notes.md)     | SaaS, billing, pricing, LLM features — thinking ahead, not committed        |

## Stack

- **Package manager:** Yarn 4 (Berry, `node-modules` linker)
- **Build system:** [Turborepo](https://turborepo.com)
- **Node:** >=24 (see `.nvmrc`)
- **Web:** Next.js 16, React 19, Tailwind CSS 4
- **API:** NestJS 11, Pino logging, Swagger docs
- **Database:** PostgreSQL 18
- **Language:** TypeScript 6
- **Test:** Vitest
- **Lint/format:** ESLint 10, Prettier 3

## Structure

```
apps/
  web/client/    Next.js app (@web/client)
  api/core/      NestJS API (@api/core)
packages/
  shared/        zod schemas, types, enums, constants (@repo/shared)
  ui/            Shared React component library (@repo/ui)
  config/        Shared eslint/typescript/prettier/tailwind config (@repo/config)
```

Workspaces are resolved via `apps/*/*` and `packages/*`, so each app lives one level deeper than usual (e.g. `apps/web/client`, `apps/api/core`) to leave room for siblings under the same domain.

## Getting started

The Node version is pinned in `.nvmrc`. Yarn does not enforce it, so select it explicitly:

```bash
nvm use                                        # Node 24.18.0
yarn install
cp .env.example .env
docker compose up -d postgres postgres-test    # Postgres for dev + an ephemeral one for tests
yarn dev
```

- Web app: http://localhost:3000
- API: http://localhost:3001
- API Swagger docs: http://localhost:3001/docs

Every environment variable the API reads is declared and validated by a zod schema in [apps/api/core/src/config/env.ts](apps/api/core/src/config/env.ts). A missing or malformed value stops the process at startup rather than surfacing as `undefined` mid-request — add new variables there rather than reading `process.env` directly.

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
| `yarn test`         | Run the test suites              |
| `yarn lint`         | Lint all workspaces              |
| `yarn check-types`  | Type-check all workspaces        |
| `yarn format`       | Format the repo with Prettier    |
| `yarn format:check` | Check formatting without writing |

Each workspace also exposes its own scripts if you want to target one package directly, e.g. `yarn workspace @web/client dev`.

## Testing

Vitest, configured in `@api/core` ([vitest.config.mts](apps/api/core/vitest.config.mts)). It compiles with `unplugin-swc` rather than Vitest's default esbuild, because esbuild cannot emit decorator metadata and both NestJS DI and TypeORM depend on it.

Integration tests run against the `postgres-test` service in [docker-compose.yml](docker-compose.yml) — ephemeral, backed by tmpfs — and are pinned to `fileParallelism: false` since they share one database.

Two suites are non-negotiable once the schema exists: cross-org isolation (a query from org A must never see org B's rows) and the permission layer.

## Git hooks

Husky + lint-staged run on every commit: staged files are formatted with Prettier and linted with their own workspace's ESLint config (`--fix`, `--max-warnings 0`). A commit is blocked if a lint issue can't be auto-fixed.

Hooks install automatically the first time you run `yarn install` (via the root `prepare` script) — no manual setup needed.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(api): …`, `fix(ui): …`). Nothing enforces this yet — there is no commitlint hook.

## Shared packages

- **`@repo/shared`**: zod schemas, types, enums, and constants used by both the API and the web client. Framework-free by rule — a lint rule blocks `@nestjs/*`, `typeorm`, `react`, and `next`, since it ships to both runtimes.
- **`@repo/ui`**: React components (Base UI + Tailwind), exported per-component from `src/components/*`. Browse them live in the web app's `/design-system` route.
- **`@repo/config`**: Centralized `eslint/*`, `typescript/*`, `prettier`, and `tailwind/theme.css` configs, consumed by every workspace via `workspace:*` so lint/type/format rules stay consistent across apps.
