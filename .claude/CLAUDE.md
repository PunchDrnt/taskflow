# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Taskflow is an internal task-tracking system for a ~100-person Thai company (~20 daily users), built part-time by the team that uses it, deployed in Thailand (Bangmod), and designed so it _could_ become a SaaS later without a rewrite. The full specification lives in [`.claude/docs/`](./docs/) and is written in Thai with English headings.

## The specification

| Want to know                                             | Open                                                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Problem, glossary, decision principles, what's binding   | [`docs/00-overview.md`](./docs/00-overview.md)                                                                                                                                             |
| Stack, module boundaries, API/naming/auth conventions    | [`docs/01-architecture.md`](./docs/01-architecture.md)                                                                                                                                     |
| Every table and field, FK rules, `org_id` scoping        | [`docs/02-database/`](./docs/02-database/README.md) — [`rules.md`](./docs/02-database/rules.md) before writing a migration, [`schema.md`](./docs/02-database/schema.md) to look a table up |
| What ships in which phase, feature priorities            | [`docs/03-roadmap.md`](./docs/03-roadmap.md)                                                                                                                                               |
| Detailed spec for each feature                           | [`docs/04-features/`](./docs/04-features/README.md) — one file per phase                                                                                                                   |
| SaaS, billing, pricing, LLM features — **not committed** | [`docs/05-saas-notes.md`](./docs/05-saas-notes.md)                                                                                                                                         |

Working checklists live in [`.claude/checklists/`](./checklists/), one per phase in dependency order rather than priority order. [`phase-1.md`](./checklists/phase-1.md) is the live one; [`phase-0.md`](./checklists/phase-0.md) is closed at `v0.1.0` and kept as a record of what was done and why. [`definition-of-done.md`](./checklists/definition-of-done.md) is the per-change gate. They are scratch state, not spec: when a checklist and the docs disagree, the docs win.

**The docs are guidelines by default.** Deviate when there's a good reason — just say that you did. The exception is a short list of binding decisions, marked 🔒 in the docs, where deviating means a full-table migration, a cross-org data leak, or history that cannot be reconstructed.

### Change protocol

- Deviating from a 🔒 **binding** item → update the doc in the same change, and say so explicitly. Never silently.
- Deviating from a **guideline** → say that you deviated. Update the doc only if the change is durable.
- An ❓ **open** item → decide it, then record the decision in the doc.

A doc that disagrees with the code is worse than no doc, because people trust it and decide wrongly.

### Binding decisions

The full list with rationale is in [`docs/00-overview.md`](./docs/00-overview.md#binding-decisions). In short:

- Date-times are `timestamptz`, stored UTC — never `timestamp`
- `org_id` on every table whose rows belong to one org — exempt only where a row belongs to no single org, which today means schema `iam`, `billing.plans` and `organization.organizations` (whose `org_id` would always equal its `id`). It is a test to apply, not a list to memorise, and a join table needs the column _most_: with both FKs composite on `(id, org_id)`, linking two orgs' rows becomes impossible in the database rather than merely discouraged. The cross-org isolation test must exist
- Unique constraints on soft-deleted tables must be **partial** indexes (`WHERE deleted_at IS NULL`) — with one deliberate exception, `task.tasks (project_id, number)`, which is a full index because a task number must never be reissued
- `created_by` / `updated_by` / `completed_by` are `RESTRICT` — deleting a user is anonymisation, not a hard delete
- `deleted_at` and `deleted_by` are set together, enforced by a CHECK on every soft-deleted table. Tables that already carry a state column meaning "no longer usable" (`sessions.revoked_at`, `password_reset_tokens.used_at`, `outbox.status`) have neither: a second delete marker is one more thing to keep in sync, and the retention policy hard-deletes them anyway
- `audit.logs` is partitioned monthly with `PRIMARY KEY (id, occurred_at)`, and is never deleted
- Audit rows are written **in the same transaction** as the business logic, not via the event emitter
- Primary keys are UUIDs; `sort_order` is `text COLLATE "C"` with fractional indexing
- One `external_channel_id` maps to exactly one org

Also settled, and easy to get wrong: DB is `snake_case` while TypeScript is `camelCase` (handled once by TypeORM's naming strategy, not per-column); writes get transactions, reads don't; RLS is deferred to Phase 2 and cannot slip further, since one person belongs to several orgs from Phase 1 and application-level `org_id` scoping is the only layer until it lands; and each web app proxies its own `/api/*` to the one Nest, so every browser request is same-origin and `SameSite=Lax` needs no CSRF token and no CORS — never collapse that into a shared `api.domain.com`. Note that SameSite compares _site_, not origin: `www.x.com` → `api.x.com` still sends a Lax cookie, only a different registrable domain does not (measured; table in docs/01-architecture.md#csrf). Back-office is a separate app on a separate registrable domain so the cookie jars are split by the browser rather than by a guard. Keep the cookie attributes in one place when auth is written.

## Domain vocabulary

These terms overlap dangerously — check here before naming anything.

| Term                   | Is                                                                                                                                                                     | Is not                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **System**             | Whole-site level, run by us · RBAC · not tied to any org · 2-5 people                                                                                                  | not a customer-facing role         |
| **Organization (org)** | The customer's top level = one company · everything hangs off it · **one person can belong to several from Phase 1**, but a single request always acts for exactly one | not a team, not a department       |
| **Team**               | People grouped by org structure · one person can be in many · used for group assignment                                                                                | not permanently bound to a project |
| **Project**            | Where tasks live · has its own members independent of teams (like a Slack channel) · has its own custom statuses                                                       | not owned by any one team          |
| **Task**               | One unit of work · always inside a project · up to two levels deep                                                                                                     | —                                  |
| **Sub-task**           | A task with `parent_task_id` · a full task with its own status and assignee                                                                                            | not a checklist item               |
| **Sprint**             | A work cycle · optional per project (`sprint_enabled`)                                                                                                                 | not mandatory                      |
| **Activity log**       | The user-facing _feature_ name — stored in `audit.logs`, owned by module `audit/`                                                                                      | not a schema name                  |
| **Username**           | The unique login name · `a-z0-9_`, 3-30 chars, lives in URLs and @-mentions · one per live account                                                                     | not a display name                 |
| **Nickname**           | What colleagues call the person · may repeat · Thai users go by it, so the assignee picker searches and shows it                                                       | not a login identifier             |

Two permission layers, kept strictly separate — system-level RBAC (ours, crosses orgs) above org-level fixed roles (`owner`/`admin`/`member`, with `admin`/`member` on teams and projects).

**`workspace` means Yarn workspace and nothing else** — not an entity, module, or schema. It used to name the schema that held projects; that is now `project`.

## Commands

All commands run from the repo root and fan out to workspaces via Turborepo.

```bash
yarn install          # install deps (Yarn 4 Berry, node-modules linker); also installs git hooks
yarn dev              # run all apps in watch mode (web on :3000, api on :4001)
yarn build            # build all apps/packages (respects dependency graph)
yarn lint             # eslint --max-warnings 0 across all workspaces
yarn check-types      # tsc --noEmit across all workspaces
yarn format           # prettier --write .
yarn format:check     # prettier --check .
yarn test             # vitest run across all workspaces
```

Local services (Postgres for development, plus an ephemeral one for the integration suite):

```bash
docker compose up -d    # postgres, postgres-test, garage, and the one-shot garage-init
```

To target a single workspace, use `yarn workspace <name> <script>`, e.g.:

```bash
yarn workspace @web/client dev
yarn workspace @api/core build
yarn workspace @repo/ui lint
```

Workspace names: `@web/client` (apps/web/client), `@api/core` (apps/api/core), `@repo/ui` (packages/ui), `@repo/shared` (packages/shared), `@repo/config` (packages/config).

Tests run on **Vitest**, configured only in `@api/core` so far (`vitest.config.mts`). It uses `unplugin-swc` rather than Vitest's default esbuild, because esbuild cannot emit decorator metadata and both NestJS DI and TypeORM depend on it. Unit tests sit beside the code as `src/**/*.spec.ts`; integration tests live in `test/` (see `test/README.md`), run against the `postgres-test` service in `docker-compose.yml`, and are pinned to `fileParallelism: false` since they share one database. They read `DATABASE_URL_TEST` — deliberately absent from `src/config/env.ts`, since the API must never connect to the test database — and skip when it is unset, so CI has to set it.

Integration suites, all in `apps/api/core/test/`: `org-isolation.spec.ts` is the 🔒 cross-org test and the one with no exceptions; `schema-drift.spec.ts` keeps entities and migrations in step; `schema-invariants.spec.ts` checks facts the schema and the application both depend on, such as the database's task-depth ceiling matching `MAX_TASK_DEPTH`; `retention.spec.ts` covers the maintenance jobs, including that the purge order satisfies every foreign key and that a row which cannot be deleted does not end the sweep; `cascade-soft-delete.spec.ts` covers what TypeORM hides without being asked (the query builder does filter soft-deleted rows, `update()` does not) and that deleting a project takes its whole tree; `audit.spec.ts`, `outbox.spec.ts`, `storage.spec.ts` and `sentry.spec.ts` cover their own modules.

`test/schema-drift.spec.ts` guards the gap `synchronize: false` leaves open: nothing reconciles entities against the database, so it applies every migration and asserts TypeORM's schema builder has no statement left to run. Note that `migration:create` emits `import { MigrationInterface, QueryRunner }` as a value import — both are types only and TypeORM's ESM entry does not export them, so it passes `nest build` and throws under Vitest. `apps/api/core/eslint.config.mjs` turns on `consistent-type-imports` for `src/database/migrations/*.ts` only, so lint-staged fixes it on commit — the same rule applied repo-wide would rewrite NestJS constructor injection, whose DI reads the `design:paramtypes` metadata that `import type` erases.

## Branching

`feat/xxx` → `main` → `prod`, one direction only, so `prod` can never hold something `main` does not. `main` is the trunk and is reached through pull requests; merging `main` into `prod` is what ships, which is why `deploy.yml` runs no tests of its own. Branch names take the Conventional Commit type as their prefix (`feat/`, `fix/`, `chore/`) and are short-lived, always cut from `main`.

There is deliberately **no `dev` branch**. An integration branch earns its keep when something deploys from it — a staging box someone can actually click through — and there is no such machine here, so `dev` would only be somewhere commits wait before a second merge, with nothing extra verified at that point: two merges and two conflict resolutions for no additional signal. Conflicts surface at pull-request time regardless of what the target branch is called. Revisit if a staging server ever exists.

Tags are not a deploy trigger: `prod` moves on every release while a tag marks a phase, and `deploy.yml` fires on pushes to `prod` only. Hotfixes take the ordinary path; cherry-picking straight onto `prod` is for when `main` is stuck, and needs following back into `main`.

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

Turborepo monorepo. Workspaces are `apps/*/*` and `packages/*` — apps sit one directory deeper than usual (`apps/web/client`, `apps/api/core`) to leave room for siblings under the same domain later.

| Workspace                          | What it is                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/client` (`@web/client`)  | Next.js 16 App Router + React 19 + Tailwind 4. `/design-system` is a live showcase of every `@repo/ui` component — check it when adding or changing one. **Atomic design applies here and nowhere else** — `packages/ui` is not organised that way and is not being converted. |
| `apps/api/core` (`@api/core`)      | NestJS 11. `src/main.ts` bootstraps `nestjs-pino` and Swagger at `/docs`; listens on `PORT` (default 4001).                                                                                                                                                                    |
| `packages/ui` (`@repo/ui`)         | `@base-ui/react` + cva + Tailwind. One directory per component, exported individually.                                                                                                                                                                                         |
| `packages/shared` (`@repo/shared`) | Framework-free zod schemas, types, constants. Real `tsc` build, because Nest cannot consume raw `.ts` from a workspace the way Next transpiles it.                                                                                                                             |
| `packages/config` (`@repo/config`) | The only home for eslint / typescript / prettier / tailwind config.                                                                                                                                                                                                            |

### Rules that bind code written elsewhere

These are the ones worth knowing _before_ opening a file. Everything else — why each is shaped the way it is, and what was measured to get there — lives in the docblock of the file named, which is where a diff will put it in front of you.

- **Environment variables go in `src/config/env.ts`** as zod, never `process.env` at the point of use. A missing value then fails at boot instead of surfacing as `undefined` mid-request.
- **New health indicators go in the readiness list**, never liveness — a failing dependency should stop traffic, not restart the container.
- **Nothing in the running app may import `database/data-source.ts`.** It reads `process.env` at import time and exists for the TypeORM CLI; `database.module.ts` builds its options from `ConfigService`.
- **`synchronize` is permanently `false`** and every migration is handwritten — it cannot emit partitions, partial indexes, `COLLATE "C"` or extensions, all of which this schema needs. Entities are listed explicitly in `database/entities.ts`, not by glob, so `nest build` and Vitest's SWC transform see the same list.
- **A new soft-deletable table must be named in `AGGREGATE_CHILDREN` or `ROOTS`** in `shared/entity/cascade-soft-delete.ts`, or a test fails. The map is hand-written because the database cannot answer what belongs to what — `tasks.project_id` is `RESTRICT` and `tasks.status_id` is `NOT NULL`, and neither means what the cascade needs.
- **Entities describe columns only** — no `@ManyToOne` for `created_by` and friends. A service that wants a user's name calls `UserService`; importing iam's `User` everywhere would break that boundary. Constraints, indexes and FKs live in migrations.
- **Services inject `OrgScopedRepository`, never `Repository<T>`** — via `provideOrgRepository(Entity)` + `@InjectOrgRepository(Entity)`. ESLint enforces it under `src/modules/**`; `src/maintenance/` is deliberately outside that rule, since every statement in it crosses orgs on purpose and is raw SQL.
- **Reach the shared layer as `#shared/*`** — a package.json subpath import, not a tsconfig `paths` alias, so tsc, `node dist/main.js`, the TypeORM CLI and Docker all resolve it with no loader. Files _inside_ `shared/` import each other relatively.
- **`queryBuilder.withOrg(alias)` is the default; `queryBuilder.base(alias)` is the deliberate crossing.** `withOrg` does not exist on an entity without `orgId`, so `base` is the only option on `iam.*` and `billing.plans` — and a decision that needs saying out loud anywhere else.
- **`AuditService.record(manager, …)` and `EmailService.enqueue(manager, …)` take the caller's `EntityManager`** and throw outside a transaction. That is how the 🔒 "audit writes in the same transaction" rule is enforced rather than remembered — a listener runs after the commit and cannot satisfy it.
- **`@repo/shared` must not import `@nestjs/*`, `typeorm`, `react` or `next`** — it ships to both runtimes. `no-restricted-imports` enforces it.
- **Import `@repo/ui` components by their specific path**, not from a package root; there is no barrel file.
- **Lint / type / format changes that affect more than one workspace go in `@repo/config`**, not the individual app.

### Where the code lives

`src/shared/` is the org-scoping layer and the part most worth reading before touching anything.

|                                   |                                                                                                                                                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/org-scope/`               | The tenant isolation: `request-context`, `org-scoped.repository`, `query-builders`, `org-repository.provider`                                                                                                                                       |
| `shared/entity/`                  | `base.entity` (seven classes — a new table picks one by the three questions in [`docs/02-database/rules.md#base-entity`](./docs/02-database/rules.md#base-entity)), `audit-columns.subscriber`, `cascade-soft-delete`                               |
| `shared/http/`                    | `route-metadata` (`@Public`, `@SkipOrgScope`), `api-exception`, `api-exception.filter`, `zod-validation.pipe`                                                                                                                                       |
| `shared/jobs/`                    | `advisory-lock`, `alert` — here rather than in `maintenance/` because `OutboxWorker` needs both too                                                                                                                                                 |
| `src/maintenance/`                | The two crons at 03:05 / 03:15 `Asia/Bangkok` — audit partition upkeep and the five retention policies. `JOBS_ENABLED=false` turns both off.                                                                                                        |
| `src/permission/`                 | `can(actor, action, subject, resource)` on CASL — the resource is **required**, because CASL reads a missing one as "could you do that to _something_". `isEverAllowedTo()` is the resource-less question asked deliberately, for drawing a button. |
| `src/modules/audit/`              | The first real domain module, and the shape the others should copy                                                                                                                                                                                  |
| `src/modules/notify/`, `storage/` | The service wrappers. `RESEND_API_KEY` is the only optional variable in `env.ts` — absent it logs instead of sending, absent under `NODE_ENV=production` the process refuses to start.                                                              |

`src/modules/<module>/*.entity.ts` is one entity per table. `iam/` is the one module split a level deeper — `auth/`, `user/`, `system/` — the structure `docs/01-architecture.md` §2 always specified, because Phase 1 gives it three times the files of any other module.

Migrations run against compiled output:

```bash
yarn workspace @api/core migration:create MyMigration   # empty timestamped file
yarn workspace @api/core migration:run                  # nest build, then apply
yarn workspace @api/core migration:revert
yarn workspace @api/core migration:show
```

## Deploy

`deploy/` holds everything the server runs, with its guides in `deploy/docs/`, which nothing at runtime reads — `compose.yml`, `config/` for what is mounted read-only, `init/` for what runs once against an empty volume, and a `.env` created there by hand. Copying that one directory to the box is the whole installation, which is what makes a `git checkout` of it a viable way to keep the server current. `deploy/compose.yml` is a **separate file**, not an override: Compose can add a service but never remove one, and `docker-compose.yml` carries `postgres-test` (truncates tables) and `garage-ui` (holds the admin token). Caddy is the only service that publishes a port; it serves both apps from one origin, `/api/*` to Nest with the prefix stripped, which is what makes `SameSite=Lax` sufficient on its own.

Both `Dockerfile`s build from the repository root, because Yarn resolves workspaces there. The API keeps the monorepo layout in the runtime image — `node_modules` holds a symlink to `packages/shared`, so flattening breaks it — and takes production dependencies from a second `yarn workspaces focus --production` stage rather than pruning. The web image needs no such stage: `output: 'standalone'` already writes the subset its server reaches, under `apps/web/client/.next/standalone` with the layout `outputFileTracingRoot` implies.

`api-migrate` is a one-shot container that runs before the API, for the reason `migrationsRun` is `false`. It needs `DATABASE_URL` and nothing else: `data-source.ts` calls `validateDatabaseUrl` rather than `validateEnv`, so a migration is never blocked on a Resend key it does not read.

`deploy/init/postgres.sh` creates the role the app connects as — `NOSUPERUSER`, owning the database, which is enough for every migration because `citext` is a _trusted_ extension. `deploy/backup.sh` writes the database and the objects to separate directories and verifies the dump with `pg_restore --list` before reporting success.

Sentry is initialised in `src/instrument.ts`, imported before anything else in `main.ts` because Sentry patches modules as they load; that file reads `process.env` directly since `ConfigService` does not exist yet. Two things hold that position, because a comment did not: `prettier/index.js` lists it in `importOrderSafeSideEffects` and gives it the first `importOrder` group, so Prettier sorts it back to the top instead of treating it as a barrier and leaving whatever lands above it in place — an IDE auto-import goes to line 1 — and `test/sentry.spec.ts` asserts the first import in `main.ts` is still `./instrument`, since that config can be edited. The failure is silent otherwise: no error, just exceptions that never arrive. `NEXT_PUBLIC_SENTRY_DSN` is a **build argument**, not an environment variable — Next inlines `NEXT_PUBLIC_*` at compile time, so setting it at container start leaves the browser half reporting nowhere.

CI copies `.env.example` to `.env` instead of listing variables, which makes the committed example a checked artefact. `garage-init` is kept out of `docker compose up --wait`, which exits 1 when any service in its set stops, even successfully.

`deploy.yml` ships on a push to `prod`, pushing to GHCR and restarting over SSH. It carries images only: the files under `deploy/` are read from disk, so they are copied to the server by hand and every deploy compares `deploy/checksum.sh` against the commit before touching anything — the server has no git, no source and no key pointing back at GitHub. The three app services declare both `image:` and `build:`, so the server pulls what CI built while `up -d --build` still works locally. Every image is tagged with the commit SHA as well as `latest`, because `latest` alone leaves nothing to roll back to; a rollback is `IMAGE_TAG=<sha>` and a pull.

Each Dockerfile copies **every** workspace manifest but only **its own** source. The manifests are not optional: `yarn install` runs at the root and `yarn.lock` covers the whole workspace, so leaving one out makes the resolution diverge from the lockfile and `--immutable` fails with YN0028. Dropping `--immutable` would avoid that at the price of an image whose dependency versions nobody pinned. The source copies are the opposite — narrow on purpose, so editing one app does not invalidate the other's build layer.

## Notes

- `typescript/nestjs.json` sets `useDefineForClassFields: false`. With `target: ES2022` TypeScript defaults it to `true`, which emits every declared-but-uninitialized class field as an own `undefined` property — that interferes with TypeORM entity hydration and partial updates. Don't remove it.
- `eslint-plugin-react` is intentionally omitted from `eslint/next.js` — its peer range still caps at ESLint ^9.7 and hasn't published ESLint 10 support yet; `eslint-plugin-react-hooks` + `@next/eslint-plugin-next` cover the gap in the meantime. Revisit once upstream catches up.
- ESLint's flat config (`eslint.config.mjs`) is resolved from the process's cwd, not per-file directory cascading — that's why each workspace has its own `eslint.config.mjs` and its own `lint` script (run with that workspace as cwd) rather than a single root config.
- Pre-commit hooks (Husky + lint-staged, configured in `lint-staged.config.mjs`) run Prettier and workspace-scoped ESLint `--fix` on staged files automatically. This isn't a substitute for running `yarn lint`/`yarn check-types` before pushing — it only catches auto-fixable issues and only on staged files.
- `apps/api/core` has two tsconfigs and they are not interchangeable. `tsconfig.json` is what the IDE and `yarn check-types` use, and it covers `src/`, `test/` and `vitest.config.mts`. `tsconfig.build.json` is what `nest build` uses (wired in `nest-cli.json`); it sets `rootDir: ./src` and excludes `test/` and `*spec.ts` so they stay out of `dist/`. `rootDir` belongs only in the build config — putting it in `tsconfig.json` makes every file under `test/` a TS6059 error. A directory missing from `tsconfig.json`'s `include` is not type-checked at all and shows up in the editor as "Cannot find name 'process'".
- This repo is intended to be copied as a starting point for new projects (see README.md's "Using this as a starter" section) — keep it dependency-light and free of project-specific business logic. The one deliberate exception is `tw-animate-css` in `@repo/config`: Tailwind v4 ships no `animate-in`/`animate-out` utilities, and Dialog, Tooltip, Select and Combobox key every open/close style off them, so without it those four components resolve to `animation-name: none` and cut rather than animate (measured).
