# Integration tests

Tests in this directory talk to a real Postgres. Unit tests live next to the
code they cover as `src/**/*.spec.ts` and need nothing running.

## Running them

```bash
docker compose up -d postgres-test
yarn test
```

`postgres-test` is the ephemeral service in `docker-compose.yml` — it stores
its data on tmpfs, so it starts empty every time the container is recreated and
losing it costs nothing. It is a separate service from `postgres` on purpose:
an integration suite that truncates tables should never be one typo away from
the database you develop against.

The connection string comes from `DATABASE_URL_TEST`. It is not part of the zod
schema in `src/config/env.ts`, because that schema describes what the API reads
at boot and the API must never connect to the test database — `test/database.ts`
reads it instead.

**When `DATABASE_URL_TEST` is unset these suites skip rather than fail**, so a
fresh checkout can run `yarn test` without Docker. CI must set it. A suite that
silently skips is worse than no suite, and the cross-org isolation test in
particular is mandatory — see `.claude/checklists/phase-0.md` §3.

## The database is reset on every run

`createMigratedTestDataSource` drops every schema and the migrations table
before applying migrations, so each run builds the schema from nothing.

This is not tidiness. A migration already recorded in the migrations table
never runs again, so editing one — which Phase 0 does freely, since nothing is
deployed — leaves this database on the old definition while the development one
has been rebuilt. The suite then fails against a schema that no longer exists
anywhere, and the error points at the migration rather than at the stale
database.

Because it drops schemas, it refuses to run unless the database name ends in
`_test`. Pointing `DATABASE_URL_TEST` at the development database fails with
`Refusing to reset "app"` rather than emptying it.

## Sharing one database

Every file connects to the same database, so `vitest.config.mts` pins
`fileParallelism: false`. Two files creating rows at once would otherwise see
each other's data and fail in ways that depend on timing.

## What lives here

| File                   | Covers                                                       |
| ---------------------- | ------------------------------------------------------------ |
| `database.ts`          | Helper: connect to the test database with migrations applied |
| `schema-drift.spec.ts` | Entities still describe the schema the migrations built      |
