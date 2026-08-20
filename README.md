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

Indicators live in [apps/api/core/src/health/health.controller.ts](apps/api/core/src/health/health.controller.ts) — currently heap and RSS memory thresholds plus a database ping on `/health` and `/health/ready`.

### Database

TypeORM is wired up in [apps/api/core/src/database/](apps/api/core/src/database/). `data-source.options.ts` builds the connection options and has no side effects; `data-source.ts` constructs the `DataSource` instance the TypeORM CLI needs and reads `process.env` when imported, so nothing in the running application should import it — `database.module.ts` builds the same options from `ConfigService` instead.

`synchronize` is permanently `false` and every migration is written by hand. `synchronize` cannot emit partitioned tables, partial indexes, `COLLATE "C"` or extensions, so it would quietly produce a schema that does not match the one that was designed.

```bash
yarn workspace @api/core migration:create MyMigration   # empty timestamped file
yarn workspace @api/core migration:run                  # nest build, then apply
yarn workspace @api/core migration:revert
yarn workspace @api/core migration:show
```

Migrations run against the compiled output in `dist/`, which needs no TypeScript loader and is the same artefact that ships. TypeORM's own bookkeeping table is `public.migrations`.

`migration:create` emits `import { MigrationInterface, QueryRunner } from 'typeorm'`. Both are types only, and TypeORM's ESM entry point does not export them — so that import compiles fine under `nest build` and throws at load time under Vitest. `consistent-type-imports` is enabled for `src/database/migrations/*.ts` and nowhere else, so lint-staged rewrites it on commit; enabling it repo-wide would strip the constructor metadata NestJS DI resolves providers from.

Because `synchronize` is off, nothing reconciles the entities against the database — an entity can describe a column no migration ever created and nothing complains until a query fails. [test/schema-drift.spec.ts](apps/api/core/test/schema-drift.spec.ts) closes that gap: it applies every migration to the test database and asserts the schema builder has nothing left to do. It catches drift in both directions.

Entities are registered explicitly in `entities.ts` rather than discovered by glob — a `*.entity.js` glob resolves differently under `nest build` than under Vitest's SWC transform, and the difference shows up as an "entity metadata not found" error in one runner but not the other. Entity properties are camelCase and mapped to snake_case columns by `snake-naming.strategy.ts`, so `@Column({ name })` is only needed to override.

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

Unit tests sit next to the code as `src/**/*.spec.ts`. Integration tests live in [apps/api/core/test/](apps/api/core/test/) and run against the `postgres-test` service in [docker-compose.yml](docker-compose.yml) — ephemeral, backed by tmpfs — pinned to `fileParallelism: false` since they share one database. They read `DATABASE_URL_TEST` and **skip when it is unset**, so a fresh checkout can run `yarn test` without Docker; CI must set it. See [test/README.md](apps/api/core/test/README.md).

Two suites are non-negotiable once the schema exists: cross-org isolation (a query from org A must never see org B's rows) and the permission layer.

## Git hooks

Husky + lint-staged run on every commit: staged files are formatted with Prettier and linted with their own workspace's ESLint config (`--fix`, `--max-warnings 0`). A commit is blocked if a lint issue can't be auto-fixed.

Hooks install automatically the first time you run `yarn install` (via the root `prepare` script) — no manual setup needed.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(api): …`, `fix(ui): …`). Nothing enforces this yet — there is no commitlint hook.

## Shared packages

- **`@repo/shared`**: zod schemas, types, enums, and constants used by both the API and the web client. Framework-free by rule — a lint rule blocks `@nestjs/*`, `typeorm`, `react`, and `next`, since it ships to both runtimes.
- **`@repo/ui`**: React components (Base UI + Tailwind), exported per-component from `src/components/*`. Browse them live in the web app's `/design-system` route.
- **`@repo/config`**: Centralized `eslint/*`, `typescript/*`, `prettier`, and `tailwind/theme.css` configs, consumed by every workspace via `workspace:*` so lint/type/format rules stay consistent across apps.
