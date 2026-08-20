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
docker compose up -d    # Postgres for dev, an ephemeral one for tests, and Garage
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

### Multi-tenancy

Every table but three carries an `org_id`, and one query returning another organisation's rows is the failure this layer exists to prevent. It is worth reading [apps/api/core/src/shared/](apps/api/core/src/shared/) before writing a service.

The current organisation and user travel in `AsyncLocalStorage` rather than as a parameter — a parameter that can be omitted eventually is. It is established by **middleware, not a guard**: a guard returns a boolean, so the storage scope it opens closes again before the route handler runs.

Services inject `OrgScopedRepository`, never TypeORM's `Repository`, and an ESLint rule under `src/modules/**` enforces it. Every read merges the org into the where clause, every write stamps it, and with no context at all the repository throws at the call site rather than running unscoped.

```ts
projects.queryBuilder.withOrg('project').andWhere(...)  // scoped
users.queryBuilder.base('user')                         // identity has no org
```

`withOrg` is a conditional property: it does not exist on entities without an `orgId` column, so `users.queryBuilder.withOrg()` fails to compile rather than at runtime. What it returns has `where` and `orWhere` removed — `where` replaces every condition set so far, org included — enforced by the type on the first call and by a Proxy for the rest of the chain, since `andWhere` returns `this` and the type stops helping.

`base` is TypeORM's plain builder. For `identity.*` and `billing.plans`, which have no `org_id` at all, that is simply correct; anywhere else it is a deliberate crossing that should be explainable.

[apps/api/core/test/org-isolation.spec.ts](apps/api/core/test/org-isolation.spec.ts) covers this against a real Postgres and has no exceptions.

### Entities

One per table under `src/modules/<module>/*.entity.ts`, each listed in `src/database/entities.ts`. They describe columns and nothing else — no relations for `created_by` and friends, since importing identity's `User` into every module would break the boundary rule that a service wanting a name calls `UserService` rather than joining. Constraints, indexes and foreign keys stay in migrations.

`base.entity.ts` offers four shapes rather than one, because `org_id` and soft delete are independent: most tables want `BaseEntity`, the identity schema and `billing.plans` have no `org_id`, sessions and password reset tokens have neither, and `audit.logs` uses none of them.

Entities are registered explicitly in `entities.ts` rather than discovered by glob — a `*.entity.js` glob resolves differently under `nest build` than under Vitest's SWC transform, and the difference shows up as an "entity metadata not found" error in one runner but not the other. Entity properties are camelCase and mapped to snake_case columns by `snake-naming.strategy.ts`, so `@Column({ name })` is only needed to override.

### Soft delete

`@DeleteDateColumn` filters `deleted_at IS NULL` out of reads — including the query builder, which the usual warnings say it does not; [cascade-soft-delete.spec.ts](apps/api/core/test/cascade-soft-delete.spec.ts) asserts the generated SQL so a change upstream is noticed. What it does not filter is `update()` and raw SQL, which is why `softDeleteById` adds `deletedAt: IsNull()` itself: without it a second call rewrites who deleted the row and restarts its ninety-day retention clock.

`ON DELETE CASCADE` fires only on a hard delete, so an aggregate has to be carried down in code — [cascade-soft-delete.ts](apps/api/core/src/shared/cascade-soft-delete.ts), one transaction, driven by a declared `AGGREGATE_CHILDREN` map.

That map is hand-written, unlike retention's purge order which is read from the catalog, because the database cannot answer this question. `tasks.project_id` is `RESTRICT` — a project holding tasks must be emptied deliberately — which says nothing about whether tasks belong to it, and `NOT NULL` is no better a signal: `tasks.status_id` is `NOT NULL`, but deleting a status moves its tasks rather than deleting them. A test requires every soft-deletable table to appear in the map or in `ROOTS`, so a new table forces the question instead of leaving its rows to outlive their parent.

### Maintenance jobs

[apps/api/core/src/maintenance/](apps/api/core/src/maintenance/) holds the two jobs nobody triggers, both at three in the morning Bangkok time: audit-log partition upkeep at 03:05, and the retention sweep at 03:15. What each kind of data is kept for is in `.claude/docs/01-architecture.md`; three details are worth knowing before touching them.

The order tables are purged in is a topological sort over `pg_constraint`, read at run time. A hand-written list would be wrong in a way nothing detects — `tasks.project_id` is `RESTRICT`, so tasks genuinely have to go before projects, and a table added without a thought for retention is rows that are simply never deleted.

`identity.users` is never hard-deleted. Every `created_by` in the schema points at it with `ON DELETE RESTRICT`, which is the decision that history keeps an author, so a user who asks to be deleted is anonymised in place instead.

Scheduled work is declared per process, so two containers fire the same cron on the same second. `pg_try_advisory_lock` means the second one skips — by the time the lock is free the work is done. `JOBS_ENABLED=false` turns both jobs off in a process entirely, which is what you want on a development machine pointed at a shared database.

### Permissions and the activity log

`can(user, action, resource)` lives in [apps/api/core/src/permission/](apps/api/core/src/permission/), built on CASL. It is a skeleton by design: it carries the role hierarchy the specification already fixes and nothing feature-specific. `can(actor, action, subject, resource)` takes the resource as a required parameter rather than an optional one, and that is deliberate. CASL reads a missing subject as "could this person do that to _something_", so a project admin gets `true` for `can('delete', 'Project')` while being allowed to delete only their own — a check that looks like it passed. Making the parameter mandatory means that form does not compile. Pass `{}` where no row is named, such as creating the first project: it fails every conditional rule, which is the safe direction. `isEverAllowedTo()` is the same question asked on purpose, for deciding whether a button should exist.

The activity log is written in the same transaction as the change it describes, which is a binding decision rather than a preference: history cannot be reconstructed, and a listener that runs after the commit loses the entry with no error anywhere. [AuditService](apps/api/core/src/modules/audit/audit.service.ts) enforces it by shape — `record(manager, entry)` takes the caller's `EntityManager` and throws unless a transaction is open, which an event listener can never satisfy. `@nestjs/event-emitter` is installed for notifications only.

`audit/` is also the first full module, and the pattern the rest should follow: `provideOrgRepository(Entity)` in its providers, `@InjectOrgRepository(Entity)` in the constructor, and only the service exported — no other module touches `audit.logs`.

### Service wrappers

Three things the API talks to that are not the database, each behind one class so the rest of the code never holds a vendor SDK.

[EmailService](apps/api/core/src/modules/notify/email.service.ts) queues into `notify.outbox` and sends nothing — `enqueue(manager, notification)` takes the caller's transaction, the same shape as the audit log, so a notification for a change that rolled back is never queued. [OutboxWorker](apps/api/core/src/modules/notify/outbox.worker.ts) delivers afterwards, retrying three times at one, five and twenty-five minutes before marking the row `failed` and leaving it as the record that someone was never told. Delivery is at-least-once on purpose: a process that dies mid-send leaves the row pending and it goes again, which is a better failure than marking it sent first and losing it.

`RESEND_API_KEY` is the one optional variable in [env.ts](apps/api/core/src/config/env.ts). Without it email goes to the log, so a developer with no Resend account can still run the API — and `NODE_ENV=production` without it fails at boot, so that affordance cannot become a silent production outage.

[StorageService](apps/api/core/src/modules/storage/storage.service.ts) speaks plain S3 through the AWS SDK, so the server underneath is a deployment choice — [Garage](https://garagehq.deuxfleurs.fr/) in `docker-compose.yml`, chosen after MinIO's community edition was archived in April 2026 and stopped publishing images. Nothing in the code knows its name; the variables are `S3_*`. The bucket is private and files reach the browser only through presigned URLs that expire; a public bucket would make every attachment in every organisation readable by anyone who has seen one URL, which is where the `org_id` scoping would stop mattering. Storage being unreachable is a failing readiness check, not a refusal to start — verified by booting with it down: `/health/live` stays 200 while `/health/ready` returns 503 naming storage. That the bucket is genuinely private is not something the code can assert about itself, so [storage.spec.ts](apps/api/core/test/storage.spec.ts) tries it: a presigned URL round-trips a file, the same URL with its signature stripped gets 403, and one given a second to live stops working.

Garage ships no web console of its own. `docker compose --profile tools up -d garage-ui` starts a community one that works against Garage v2 — it holds the admin token, so it binds to localhost only and belongs behind an authenticating proxy anywhere else. For just looking at files, `aws --endpoint-url http://localhost:4900 s3 ls s3://taskflow --recursive` needs nothing running.

[FeatureService](apps/api/core/src/feature/feature.service.ts) answers `can(org, feature)` with `true`, always. It exists so the call sites are written now instead of being retrofitted into every controller at once when plans arrive.

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

Unit tests sit next to the code as `src/**/*.spec.ts`. Integration tests live in [apps/api/core/test/](apps/api/core/test/) and run against the `postgres-test` service in [docker-compose.yml](docker-compose.yml) — ephemeral, backed by tmpfs — pinned to `fileParallelism: false` since they share one database. They read `DATABASE_URL_TEST` — and `storage.spec.ts` reads `S3_ENDPOINT` — and **skip when unset**, so a fresh checkout can run `yarn test` without Docker; CI must set it. See [test/README.md](apps/api/core/test/README.md).

| Suite                                                                         | Covers                                                                                               |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [org-isolation.spec.ts](apps/api/core/test/org-isolation.spec.ts)             | 🔒 A query from org A must never see org B's rows                                                    |
| [schema-drift.spec.ts](apps/api/core/test/schema-drift.spec.ts)               | Entities still describe the schema the migrations built                                              |
| [schema-invariants.spec.ts](apps/api/core/test/schema-invariants.spec.ts)     | Facts the schema and the code both rely on, such as the task-depth ceiling matching `MAX_TASK_DEPTH` |
| [retention.spec.ts](apps/api/core/test/retention.spec.ts)                     | The maintenance jobs: purge order, anonymisation, partition upkeep, the advisory lock                |
| [cascade-soft-delete.spec.ts](apps/api/core/test/cascade-soft-delete.spec.ts) | What TypeORM hides on its own, and that an aggregate goes down whole                                 |
| [audit.spec.ts](apps/api/core/test/audit.spec.ts)                             | 🔒 The activity log commits and rolls back with the change it describes                              |
| [outbox.spec.ts](apps/api/core/test/outbox.spec.ts)                           | Notification queue and delivery: retries, backoff, and giving up                                     |
| [storage.spec.ts](apps/api/core/test/storage.spec.ts)                         | The bucket is private: a presigned URL works, the plain one gets 403                                 |

The permission layer joins them once it exists.

## Git hooks

Husky + lint-staged run on every commit: staged files are formatted with Prettier and linted with their own workspace's ESLint config (`--fix`, `--max-warnings 0`). A commit is blocked if a lint issue can't be auto-fixed.

Hooks install automatically the first time you run `yarn install` (via the root `prepare` script) — no manual setup needed.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(api): …`, `fix(ui): …`). Nothing enforces this yet — there is no commitlint hook.

## Shared packages

- **`@repo/shared`**: zod schemas, types, enums, and constants used by both the API and the web client. Framework-free by rule — a lint rule blocks `@nestjs/*`, `typeorm`, `react`, and `next`, since it ships to both runtimes.
- **`@repo/ui`**: React components (Base UI + Tailwind), exported per-component from `src/components/*`. Browse them live in the web app's `/design-system` route.
- **`@repo/config`**: Centralized `eslint/*`, `typescript/*`, `prettier`, and `tailwind/theme.css` configs, consumed by every workspace via `workspace:*` so lint/type/format rules stay consistent across apps.
