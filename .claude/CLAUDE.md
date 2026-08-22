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

Also settled, and easy to get wrong: DB is `snake_case` while TypeScript is `camelCase` (handled once by TypeORM's naming strategy, not per-column); writes get transactions, reads don't; RLS is deliberately deferred to Phase 2; and each web app proxies its own `/api/*` to the one Nest, so every browser request is same-origin and `SameSite=Lax` needs no CSRF token and no CORS — never collapse that into a shared `api.domain.com`. Note that SameSite compares _site_, not origin: `www.x.com` → `api.x.com` still sends a Lax cookie, only a different registrable domain does not (measured; table in docs/01-architecture.md#csrf). Back-office is a separate app on a separate registrable domain so the cookie jars are split by the browser rather than by a guard. Keep the cookie attributes in one place when auth is written.

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

`src/modules/<module>/*.entity.ts` holds one entity per table, module by module, and every one is listed in `src/database/entities.ts`. `identity/` is the one module split a level deeper — `auth/`, `user/` and `system/`, the structure `docs/01-architecture.md` §2 always specified — because Phase 1 gives it three times the files of any other module. Entities describe columns only — no `@ManyToOne` for `created_by` and friends, since importing identity's `User` into every module would break the boundary rule that says a service wanting a name calls `UserService` rather than joining. Constraints, indexes and foreign keys live in migrations.

`src/shared/` is the org-scoping layer, and the part of this repo most worth reading before touching anything. It is grouped into three folders and reached from outside as **`#shared/*`** — a package.json subpath import, not a tsconfig `paths` alias, because tsc never rewrites module specifiers and this needs no rewriting: `types` points at `src/` so the compiler reads the sources, `default` at `dist/` so plain `node dist/main.js`, the TypeORM CLI and the Docker image all resolve it with no loader and no build step (measured on all three). Vitest runs the sources rather than `dist/`, so `vitest.config.mts` aliases `#shared/*` back to `src/shared/*`; without that the suite would test the last build instead of the working tree. Files inside `shared/` import each other relatively.

**`org-scope/`** — the tenant isolation itself.

- `request-context.ts` — `AsyncLocalStorage<{ orgId, userId }>`. `requireRequestContext()` throws rather than defaulting; there is no safe guess for an org.
- `request-context.middleware.ts` — establishes it from `request.auth`, which nothing sets yet. Phase 1's `AuthGuard` replaces it: auth belongs in a guard, since only a guard sees route metadata like `@Public()`. A guard cannot use `runWithRequestContext` — `canActivate` returns a boolean, so the scope closes before the handler — it has to call `AsyncLocalStorage.enterWith`, which was measured to survive `await`s and to stay per-request under 20 concurrent requests (docs/01-architecture.md#auth). `run` remains correct for jobs, seeds and tests.
- `org-scoped.repository.ts` — the narrow, always-scoped CRUD surface. Services inject this, never `Repository<T>`; ESLint enforces that under `src/modules/**`. `save()` refuses an `id` the current org does not own: the org is stamped onto a write rather than checked, so before the check a save carrying another org's id moved that row into the caller's org. `updateById` and `softDeleteById` both add `deletedAt: IsNull()` and write `updatedBy` themselves, because TypeORM's `update()` neither filters soft-deleted rows nor runs the subscriber. The find family takes `ScopedFindManyOptions`, which is `FindManyOptions` minus `skip`: the API convention is cursor paging because `sort_order` is LexoRank, so an offset page repeats or drops a row the moment anyone inserts mid-list — `findAndCount`'s `[rows, total]` is the shape most likely to invite it. `take` stays, and a genuinely unordered offset goes through `queryBuilder.withOrg()`.
- `query-builders.ts` — `queryBuilder.withOrg(alias)` and `queryBuilder.base(alias)`. `withOrg` is a conditional property, absent on entities with no `orgId` column, and returns a builder with `where`/`orWhere` removed by type and by Proxy. `base` is TypeORM's plain builder: correct for `identity.*` and `billing.plans`, which have no org, and a deliberate crossing anywhere else.
- `org-repository.provider.ts` — `provideOrgRepository(Entity)` and `@InjectOrgRepository(Entity)`, the pair a module uses to reach its own tables. Both halves live in one file so the injection token cannot drift.

**`entity/`** — the shape every table has, and the code that maintains it.

- `base.entity.ts` — six classes, because `org_id`, soft delete, and whether a row is ever edited after creation are three independent axes. The third one is narrow: `role_permissions`, `user_roles` and `task.assignees` are grants and assignments that only ever get created or removed, never updated in place, so `updatedAt`/`updatedBy` would sit there forever equal to the created pair. See the exception table in `docs/02-database.md`.
- `audit-columns.subscriber.ts` — fills `createdBy`/`updatedBy`/`deletedBy`. Registered in the DataSource's `subscribers`, not as a Nest provider, so it applies under the CLI and in tests too.
- `cascade-soft-delete.ts` — `softDelete(table, id)` carries an aggregate down in one transaction, because `ON DELETE CASCADE` only fires on a hard delete. Its `AGGREGATE_CHILDREN` map is hand-written, unlike retention's purge order, because the database cannot answer what belongs to what: `tasks.project_id` is RESTRICT and `tasks.status_id` is NOT NULL, and neither means what the cascade needs. A test requires every soft-deletable table to be in the map or in `ROOTS`.

**`jobs/`** — what work nobody triggers needs.

- `advisory-lock.ts` — `withAdvisoryLock(dataSource, key, work)` and the one `LOCK_KEYS` table. Here rather than in `maintenance/` because `OutboxWorker` takes one too, and the second caller is what turns a borrowed import into a boundary problem.
- `alert.ts` — `alertsFor(area)`. Work nobody watches needs somewhere to fail out loud; the log line stays and this is what comes and finds you. The area is bound once per module rather than passed per call, because the tag is what a Sentry alert rule filters on. It lives here rather than in `maintenance/` because `OutboxWorker` needs it too.

At the root, belonging to none of the three: `shared.module.ts`, plus

- `route-metadata.ts` — `@Public()` and `@SkipOrgScope()`, together because they are easy to confuse: the first says no sign-in is needed, the second says signed in but bound to no org. Nothing reads either until Phase 1's guard, which is also when it should move into an `http/` folder alongside the guard, the validation pipe and the exception filter.
- `system-user.ts` — `SYSTEM_USER_ID`, the account automated writes are attributed to. The subscriber deliberately invents nothing when there is no request context, so a job or migration has to name this itself. Migration `003` spells the same uuid out rather than importing it; `test/schema-invariants.spec.ts` holds the two together.

`src/maintenance/` is the other side of that coin: the jobs nobody triggers, kept from being silent by `shared/alert.ts` and kept from doubling up by `shared/advisory-lock.ts`. Two crons at 03:05 and 03:15 `Asia/Bangkok` — audit-log partition upkeep, and the five retention policies from `docs/01-architecture.md`. It sits beside `src/modules/` rather than inside it because every statement in it crosses orgs on purpose and is raw SQL, which is also why the ESLint rule banning a plain `Repository` does not reach it. Three things there are load-bearing: the purge order is a topological sort over `pg_constraint` read at run time rather than a hand-kept list, since `tasks.project_id` is RESTRICT and a forgotten table is rows that are never deleted with nothing to say so; `identity.users` is in `NEVER_PURGED` because every `created_by` points at it, so a user is anonymised and never removed; and `pg_try_advisory_lock` means a second instance firing the same cron skips rather than queues. `JOBS_ENABLED=false` turns both off in one process.

`src/permission/` also holds `SYSTEM_PERMISSIONS` — the system-level keys, seeded by a migration that spells them out rather than importing them, so editing the object cannot change what an applied migration did; `test/schema-invariants.spec.ts` fails if the two drift. Roles and the role → permission mapping are deliberately unseeded, because the spec puts that mapping in the database so it can change without a deploy. `src/permission/` holds `can(user, action, resource)`, built on CASL — a skeleton carrying only the role hierarchy the spec fixes (`owner`/`admin`/`member` on the org, `admin`/`member` on teams and projects), with system-level RBAC deliberately absent until Phase 7. `can(actor, action, subject, resource)` takes the resource as a **required** parameter, which is the point: CASL reads a missing one as "could you do that to _something_", so a project admin gets `true` for `can('delete', 'Project')` while being allowed only their own — a check that looks passed and is not. Requiring it makes that form fail to compile. `{}` is valid where no row is named (`create Project`) and fails every conditional rule, which is the safe direction. `isEverAllowedTo()` is the resource-less question asked deliberately, for drawing a button.

`src/modules/audit/` is the first real domain module and the shape the others should copy. `AuditService.record(manager, entry)` takes the caller's `EntityManager` and throws unless a transaction is open, which is how the 🔒 "audit writes in the same transaction" rule is enforced rather than remembered — an event listener runs after the commit, so it cannot satisfy it. `provideOrgRepository(Entity)` and `@InjectOrgRepository(Entity)` from `#shared/org-scope/org-repository.provider` are how a module reaches its tables, since `@InjectRepository` is banned under `src/modules/**`.

`src/modules/notify/` and `src/modules/storage/` are the service wrappers, plus `src/feature/`. `EmailService.enqueue(manager, …)` takes the caller's transaction the same way `AuditService.record` does, and `OutboxWorker` delivers afterwards — at-least-once, sending immediately and then retrying at +5 and +25 minutes before marking a row `failed` and alerting, since nothing retries a `failed` row. Three attempts leave two gaps, and `attempts = 0` is claimed without waiting — the `BACKOFF_BASE_SECONDS` docblock spells out why the 1-minute step the formula implies never happens. Its `claim()` is an `UPDATE ... RETURNING`, not a `SELECT ... FOR UPDATE`: `dataSource.query()` runs each statement in its own implicit transaction, so the row locks of a bare SELECT are gone before the caller reads the rows — measured, and two workers then sent 23 emails for 12 rows. Bumping `attempts` at claim time also arms the backoff for a process that dies mid-send, so `attempts` counts attempts made rather than failures suffered. `RESEND_API_KEY` is the only optional variable in `env.ts`: absent, email goes to the log so a developer can boot; absent under `NODE_ENV=production`, the process refuses to start. `StorageService` speaks plain S3 through the AWS SDK — the server is Garage in `docker-compose.yml`, picked after MinIO's community edition was archived in April 2026, and no code knows its name — `S3_HOST` is a bare host, since the scheme and port come from `S3_USE_SSL` and `S3_PORT`. It keeps the bucket private and hands out presigned URLs only; unreachable storage fails `/health/ready` rather than stopping the app. Three things there were expensive to find and are now commented at the line: `keyFor` sanitises with `\p{L}\p{N}\p{M}` and the `u` flag, because `\w` is ASCII-only and turned `ใบเสร็จ 2026.pdf` into `_2026.pdf` — and `\p{M}` is not optional, since Thai vowels and tones are combining marks rather than letters; the client's region must match the server's (Garage's own default is `garage`, the SDK's is `us-east-1`, and a mismatch reads as a credentials error), and the SDK's automatic CRC32 checksum breaks presigned uploads, so `requestChecksumCalculation` is `WHEN_REQUIRED`. Garage's image has no shell at all, so `deploy/init/garage.sh` runs in a separate curl container against the admin API.

**`packages/ui`** (`@repo/ui`) — Shared React component library built on `@base-ui/react` primitives + `class-variance-authority` + Tailwind. Each component lives in its own directory under `src/components/<name>/index.tsx` and is exported individually via the package's `exports` map (`./components/*` → `./src/components/*/index.tsx`), not as a single barrel file — import components by their specific path, not from a package root. Also exports `./globals.css`, `./hooks/*`, and `./lib/*`.

**`packages/shared`** (`@repo/shared`) — Framework-free code shared by the API and the web client: zod schemas, types, enums, constants. Unlike `@repo/ui`, it has a real build step (`tsc` → `dist/`), because NestJS compiles with `tsc` and cannot consume raw `.ts` from a workspace the way Next transpiles it. A `no-restricted-imports` rule in its `eslint.config.mjs` blocks `@nestjs/*`, `typeorm`, `react`, and `next` — it ships to both runtimes, so it must depend on neither.

**`packages/config`** (`@repo/config`) — Single source of truth for lint/type/format config, consumed by every other workspace via `workspace:*`:

- `eslint/base.js` — shared flat config (ESLint 10 + typescript-eslint + eslint-config-prettier), extended by `eslint/nestjs.js`, `eslint/next.js`, and `eslint/react-library.js` for stack-specific rules (e.g. Nest disables some OOP-unfriendly TS rules; Next/react-library add `eslint-plugin-react-hooks` and, for Next, `@next/eslint-plugin-next`).
- `typescript/base.json` extended by `typescript/nextjs.json`, `typescript/nestjs.json`, `typescript/react-library.json`.
- `prettier/index.js` — shared Prettier config. Its `importOrderSafeSideEffects` / first `importOrder` entry for `^\./instrument$` is load-bearing rather than cosmetic: see the Sentry note under Deploy before rewriting the import groups.
- `tailwind/theme.css` — shared Tailwind v4 theme, pulled into `@repo/ui`'s and the web app's global styles.

When changing lint/type/format behavior for more than one workspace, change it here rather than in the individual app.

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
