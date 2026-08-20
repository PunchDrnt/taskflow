# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Taskflow is an internal task-tracking system for a ~100-person Thai company (~20 daily users), built part-time by the team that uses it, deployed in Thailand (Bangmod), and designed so it _could_ become a SaaS later without a rewrite. The full specification lives in [`.claude/docs/`](./docs/) and is written in Thai with English headings.

## The specification

| Want to know                                             | Open                                                   |
| -------------------------------------------------------- | ------------------------------------------------------ |
| Problem, glossary, decision principles, what's binding   | [`docs/00-overview.md`](./docs/00-overview.md)         |
| Stack, module boundaries, API/naming/auth conventions    | [`docs/01-architecture.md`](./docs/01-architecture.md) |
| Every table and field, FK rules, `org_id` scoping        | [`docs/02-database.md`](./docs/02-database.md)         |
| What ships in which phase, feature priorities            | [`docs/03-roadmap.md`](./docs/03-roadmap.md)           |
| Detailed spec for each feature                           | [`docs/04-features.md`](./docs/04-features.md)         |
| SaaS, billing, pricing, LLM features — **not committed** | [`docs/05-saas-notes.md`](./docs/05-saas-notes.md)     |

Working checklists live in [`.claude/checklists/`](./checklists/) — [`phase-0.md`](./checklists/phase-0.md) tracks the current phase in dependency order, and [`definition-of-done.md`](./checklists/definition-of-done.md) is the per-change gate. They are scratch state, not spec: when a checklist and the docs disagree, the docs win.

**The docs are guidelines by default.** Deviate when there's a good reason — just say that you did. The exception is a short list of binding decisions, marked 🔒 in the docs, where deviating means a full-table migration, a cross-org data leak, or history that cannot be reconstructed.

### Change protocol

- Deviating from a 🔒 **binding** item → update the doc in the same change, and say so explicitly. Never silently.
- Deviating from a **guideline** → say that you deviated. Update the doc only if the change is durable.
- An ❓ **open** item → decide it, then record the decision in the doc.

A doc that disagrees with the code is worse than no doc, because people trust it and decide wrongly.

### Binding decisions

The full list with rationale is in [`docs/00-overview.md`](./docs/00-overview.md#binding-decisions). In short:

- Date-times are `timestamptz`, stored UTC — never `timestamp`
- `org_id` on every table except schema `identity`, `billing.plans` and `organization.organizations` (whose `org_id` would always equal its `id`), and the cross-org isolation test must exist
- Unique constraints on soft-deleted tables must be **partial** indexes (`WHERE deleted_at IS NULL`)
- `created_by` / `updated_by` / `completed_by` are `RESTRICT` — deleting a user is anonymisation, not a hard delete
- `deleted_at` and `deleted_by` are set together, enforced by a CHECK on every soft-deleted table. Tables that already carry a state column meaning "no longer usable" (`sessions.revoked_at`, `password_reset_tokens.used_at`, `outbox.status`) have neither: a second delete marker is one more thing to keep in sync, and the retention policy hard-deletes them anyway
- `audit.logs` is partitioned monthly with `PRIMARY KEY (id, occurred_at)`, and is never deleted
- Audit rows are written **in the same transaction** as the business logic, not via the event emitter
- Primary keys are UUIDs; `sort_order` is `text COLLATE "C"` with fractional indexing
- One `external_channel_id` maps to exactly one org

Also settled, and easy to get wrong: DB is `snake_case` while TypeScript is `camelCase` (handled once by TypeORM's naming strategy, not per-column); writes get transactions, reads don't; RLS is deliberately deferred to Phase 2.

## Domain vocabulary

These terms overlap dangerously — check here before naming anything.

| Term                   | Is                                                                                                               | Is not                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **System**             | Whole-site level, run by us · RBAC · not tied to any org · 2-5 people                                            | not a customer-facing role         |
| **Organization (org)** | The customer's top level = one company · everything hangs off it · Phase 1-6 has exactly one                     | not a team, not a department       |
| **Team**               | People grouped by org structure · one person can be in many · used for group assignment                          | not permanently bound to a project |
| **Project**            | Where tasks live · has its own members independent of teams (like a Slack channel) · has its own custom statuses | not owned by any one team          |
| **Task**               | One unit of work · always inside a project · up to two levels deep                                               | —                                  |
| **Sub-task**           | A task with `parent_task_id` · a full task with its own status and assignee                                      | not a checklist item               |
| **Sprint**             | A work cycle · optional per project (`sprint_enabled`)                                                           | not mandatory                      |
| **Activity log**       | The user-facing _feature_ name — stored in `audit.logs`, owned by module `audit/`                                | not a schema name                  |

Two permission layers, kept strictly separate — system-level RBAC (ours, crosses orgs) above org-level fixed roles (`owner`/`admin`/`member`, with `admin`/`member` on teams and projects).

**`workspace` means Yarn workspace and nothing else** — not an entity, module, or schema. It used to name the schema that held projects; that is now `project`.

## Commands

All commands run from the repo root and fan out to workspaces via Turborepo.

```bash
yarn install          # install deps (Yarn 4 Berry, node-modules linker); also installs git hooks
yarn dev              # run all apps in watch mode (web on :3000, api on :3001)
yarn build            # build all apps/packages (respects dependency graph)
yarn lint             # eslint --max-warnings 0 across all workspaces
yarn check-types      # tsc --noEmit across all workspaces
yarn format           # prettier --write .
yarn format:check     # prettier --check .
yarn test             # vitest run across all workspaces
```

Local services (Postgres for development, plus an ephemeral one for the integration suite):

```bash
docker compose up -d postgres postgres-test
```

To target a single workspace, use `yarn workspace <name> <script>`, e.g.:

```bash
yarn workspace @web/client dev
yarn workspace @api/core build
yarn workspace @repo/ui lint
```

Workspace names: `@web/client` (apps/web/client), `@api/core` (apps/api/core), `@repo/ui` (packages/ui), `@repo/shared` (packages/shared), `@repo/config` (packages/config).

Tests run on **Vitest**, configured only in `@api/core` so far (`vitest.config.mts`). It uses `unplugin-swc` rather than Vitest's default esbuild, because esbuild cannot emit decorator metadata and both NestJS DI and TypeORM depend on it. Unit tests sit beside the code as `src/**/*.spec.ts`; integration tests live in `test/` (see `test/README.md`), run against the `postgres-test` service in `docker-compose.yml`, and are pinned to `fileParallelism: false` since they share one database. They read `DATABASE_URL_TEST` — deliberately absent from `src/config/env.ts`, since the API must never connect to the test database — and skip when it is unset, so CI has to set it.

`test/schema-drift.spec.ts` guards the gap `synchronize: false` leaves open: nothing reconciles entities against the database, so it applies every migration and asserts TypeORM's schema builder has no statement left to run. Note that `migration:create` emits `import { MigrationInterface, QueryRunner }` as a value import — both are types only and TypeORM's ESM entry does not export them, so it passes `nest build` and throws under Vitest. `apps/api/core/eslint.config.mjs` turns on `consistent-type-imports` for `src/database/migrations/*.ts` only, so lint-staged fixes it on commit — the same rule applied repo-wide would rewrite NestJS constructor injection, whose DI reads the `design:paramtypes` metadata that `import type` erases.

## Commit conventions

This repo uses [Conventional Commits](https://www.conventionalcommits.org/). Format every commit as `type(scope): subject`:

```
feat(api): add terminus health checks
fix(ui): correct badge contrast in dark mode
chore(deps): bump next to 16.2.11
docs: document health endpoints in README
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `style`. Use `!` after the type/scope (`feat(api)!:`) or a `BREAKING CHANGE:` footer for breaking changes.

Scope should be the workspace or area being touched — `api`, `web`, `ui`, `config`, `deps`, `repo`. Omit it when a change spans the whole repo. Keep the subject imperative and lowercase, under ~72 characters, with no trailing period.

Nothing enforces this automatically yet — there is no commitlint hook, so the convention is by discipline.

## Architecture

This is a Turborepo monorepo. Workspaces are declared as `apps/*/*` and `packages/*` in the root `package.json` — apps live one directory deeper than usual (`apps/web/client`, `apps/api/core`) to leave room for sibling apps under the same domain later.

**`apps/web/client`** — Next.js 16 (App Router, Turbopack) + React 19 + Tailwind CSS 4. Consumes `@repo/ui` for components and `@repo/config` for eslint/typescript config. The `/design-system` route (`src/app/design-system/`) is a live showcase of every `@repo/ui` component, organized by category (buttons, forms, overlays, data-display, typography, colors, badges) — check it when adding or changing a shared component.

**`apps/api/core`** — NestJS 11 API. Entry point is `src/main.ts`: bootstraps with `nestjs-pino` for logging (pretty-printed outside `NODE_ENV=production`, level via `LOG_LEVEL`) and Swagger docs mounted at `/docs`. Listens on `PORT` env var (default 3001). Every environment variable is declared and validated by a zod schema in `src/config/env.ts`, wired through `ConfigModule.forRoot({ validate })` — a missing or malformed value fails the process at boot rather than surfacing as `undefined` mid-request, so **add new variables there** rather than reading `process.env` directly. `src/health/` holds `@nestjs/terminus` health checks at `/health`, `/health/live`, and `/health/ready` — when adding a dependency (database, cache, upstream API), register its indicator in the **readiness** list in `health.controller.ts`, never in liveness, since a failing dependency should stop traffic rather than restart the container.

`src/database/` holds the TypeORM wiring. `data-source.options.ts` builds the options and has no side effects; `data-source.ts` constructs the `DataSource` the CLI needs and reads `process.env` at import time, so **nothing in the running app may import it** — `database.module.ts` builds its options from `ConfigService` instead. `synchronize` is permanently `false` and every migration is handwritten, because `synchronize` cannot emit partitions, partial indexes, `COLLATE "C"` or extensions, all of which this schema depends on. Entities are registered explicitly in `entities.ts` rather than by glob, so the list behaves the same under `nest build` and under Vitest's SWC transform. Migrations run against the compiled output:

```bash
yarn workspace @api/core migration:create MyMigration   # empty timestamped file
yarn workspace @api/core migration:run                  # nest build, then apply
yarn workspace @api/core migration:revert
yarn workspace @api/core migration:show
```

**`packages/ui`** (`@repo/ui`) — Shared React component library built on `@base-ui/react` primitives + `class-variance-authority` + Tailwind. Each component lives in its own directory under `src/components/<name>/index.tsx` and is exported individually via the package's `exports` map (`./components/*` → `./src/components/*/index.tsx`), not as a single barrel file — import components by their specific path, not from a package root. Also exports `./globals.css`, `./hooks/*`, and `./lib/*`.

**`packages/shared`** (`@repo/shared`) — Framework-free code shared by the API and the web client: zod schemas, types, enums, constants. Unlike `@repo/ui`, it has a real build step (`tsc` → `dist/`), because NestJS compiles with `tsc` and cannot consume raw `.ts` from a workspace the way Next transpiles it. A `no-restricted-imports` rule in its `eslint.config.mjs` blocks `@nestjs/*`, `typeorm`, `react`, and `next` — it ships to both runtimes, so it must depend on neither.

**`packages/config`** (`@repo/config`) — Single source of truth for lint/type/format config, consumed by every other workspace via `workspace:*`:

- `eslint/base.js` — shared flat config (ESLint 10 + typescript-eslint + eslint-config-prettier), extended by `eslint/nestjs.js`, `eslint/next.js`, and `eslint/react-library.js` for stack-specific rules (e.g. Nest disables some OOP-unfriendly TS rules; Next/react-library add `eslint-plugin-react-hooks` and, for Next, `@next/eslint-plugin-next`).
- `typescript/base.json` extended by `typescript/nextjs.json`, `typescript/nestjs.json`, `typescript/react-library.json`.
- `prettier/index.js` — shared Prettier config.
- `tailwind/theme.css` — shared Tailwind v4 theme, pulled into `@repo/ui`'s and the web app's global styles.

When changing lint/type/format behavior for more than one workspace, change it here rather than in the individual app.

## Notes

- `typescript/nestjs.json` sets `useDefineForClassFields: false`. With `target: ES2022` TypeScript defaults it to `true`, which emits every declared-but-uninitialized class field as an own `undefined` property — that interferes with TypeORM entity hydration and partial updates. Don't remove it.
- `eslint-plugin-react` is intentionally omitted from `eslint/next.js` — its peer range still caps at ESLint ^9.7 and hasn't published ESLint 10 support yet; `eslint-plugin-react-hooks` + `@next/eslint-plugin-next` cover the gap in the meantime. Revisit once upstream catches up.
- ESLint's flat config (`eslint.config.mjs`) is resolved from the process's cwd, not per-file directory cascading — that's why each workspace has its own `eslint.config.mjs` and its own `lint` script (run with that workspace as cwd) rather than a single root config.
- Pre-commit hooks (Husky + lint-staged, configured in `lint-staged.config.mjs`) run Prettier and workspace-scoped ESLint `--fix` on staged files automatically. This isn't a substitute for running `yarn lint`/`yarn check-types` before pushing — it only catches auto-fixable issues and only on staged files.
- `apps/api/core` has two tsconfigs and they are not interchangeable. `tsconfig.json` is what the IDE and `yarn check-types` use, and it covers `src/`, `test/` and `vitest.config.mts`. `tsconfig.build.json` is what `nest build` uses (wired in `nest-cli.json`); it sets `rootDir: ./src` and excludes `test/` and `*spec.ts` so they stay out of `dist/`. `rootDir` belongs only in the build config — putting it in `tsconfig.json` makes every file under `test/` a TS6059 error. A directory missing from `tsconfig.json`'s `include` is not type-checked at all and shows up in the editor as "Cannot find name 'process'".
- This repo is intended to be copied as a starting point for new projects (see README.md's "Using this as a starter" section) — keep it dependency-light and free of project-specific business logic.
