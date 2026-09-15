# Where things are

A map of `apps/api/core/src`, for finding a file rather than for explaining
the design — the reasons live in the docblock of whatever you open, and the
architecture is in [`.claude/docs/01-architecture.md`](../../../../.claude/docs/01-architecture.md).

`test/code-map.spec.ts` fails when this file and the tree disagree, so a
directory added without a line here, or a line here naming something that no
longer exists, breaks the build rather than quietly becoming a lie.

## Where a request lands

The URL the browser asks for is `/api/v1/...`; Caddy strips `/api` and
`main.ts` adds `v1`, so a controller's prefix is the middle of that.

| Route prefix                   | File                                                      |
| ------------------------------ | --------------------------------------------------------- |
| `auth`                         | `modules/iam/auth/auth.controller.ts`                     |
| `me`                           | `modules/iam/auth/me.controller.ts`                       |
| `me` (password)                | `modules/iam/auth/password/me-password.controller.ts`     |
| `me/2fa`                       | `modules/iam/auth/two-factor/me-two-factor.controller.ts` |
| `me/tasks`                     | `modules/task/my-work.controller.ts`                      |
| `users`                        | `modules/iam/user/user-avatar.controller.ts`              |
| `org`                          | `modules/organization/organization.controller.ts`         |
| `projects`                     | `modules/project/project.controller.ts`                   |
| `projects/:projectId/statuses` | `modules/project/status.controller.ts`                    |
| `projects/:projectId/tasks`    | `modules/task/project-task.controller.ts`                 |
| `tasks`                        | `modules/task/task.controller.ts`                         |
| `health`                       | `health/health.controller.ts`                             |
| (root)                         | `app.controller.ts` — name and version, nothing else      |

Three controllers answer under `me` because they are three subjects, not one:
the profile, the password, and second-factor enrolment. `me/tasks` is in
`task/` rather than with them, because it is a task query that happens to be
filtered by the caller.

## Directories

| Directory      | What is in it                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `config/`      | `env.ts` — every environment variable, as zod. Nothing reads `process.env` anywhere else        |
| `database/`    | The data source, the migrations, the seeds, and `entities.ts`, which lists every entity by hand |
| `feature/`     | Feature flags. Deny by default: absent means off                                                |
| `health/`      | Liveness and readiness                                                                          |
| `maintenance/` | The two crons — audit partitions at 03:05, retention at 03:15                                   |
| `modules/`     | The domain. One directory per schema; see below                                                 |
| `permission/`  | CASL. `ability.ts` is who may do what; the guard and decorator apply it                         |
| `shared/`      | The org-scoping layer and the HTTP plumbing; see below                                          |

## `modules/`

A directory per database schema. Some hold working code, and some hold only
the entities for tables that exist and nothing reads yet — the table is
migrated, and the feature is a later phase. The second kind is marked, so
"this module is empty" is never a surprise discovered by opening it.

| Module          | State       | Holds                                                             |
| --------------- | ----------- | ----------------------------------------------------------------- |
| `audit/`        | live        | The activity log. The first real module, and the shape to copy    |
| `iam/`          | live        | Accounts, split a level deeper: `auth/`, `user/`, `system/`       |
| `notify/`       | live        | Email, the outbox and its worker                                  |
| `organization/` | live        | Organisations, members, teams, invitations                        |
| `project/`      | live        | Projects, their members, their statuses, sprints                  |
| `storage/`      | live        | Object storage: the S3 wrapper, the key layout, image re-encoding |
| `task/`         | live        | Tasks, assignees, and the two task queries that are not `/tasks`  |
| `billing/`      | tables only | Plans, subscriptions, AI wallet and usage — Phase 7               |
| `discussion/`   | tables only | Comments and attachments — Phase 3                                |
| `field/`        | tables only | Custom field definitions — Phase 4                                |
| `view/`         | tables only | Saved views and their columns — Phase 4                           |

Inside `iam/`:

- `auth/` — signing in and out, and `/me`: the controller, `AuthService`,
  lockout, and the OAuth identity row
  - `auth/session/` — how a request proves who it is, all four pieces
    together: the two JWTs, the cookies that carry them, the `sessions` row the
    refresh token points at, and the guard that reads all three on every request
  - `auth/password/` — hashing, reset tokens, changing your own
  - `auth/two-factor/` — TOTP, recovery codes, enrolment
- `user/` — the account itself, and the avatar endpoint
- `system/` — system-level RBAC tables. Ours, crossing organisations

`auth/` is the one directory deep enough to need this, and the split is by
subject rather than by kind: a `services/` beside an `entities/` would put
`session.entity.ts` and `session.service.ts` in different places, which is the
opposite of what somebody reading about sessions wants.

## `shared/`

The part most worth reading before touching anything else.

| Directory    | What is in it                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `org-scope/` | The tenant isolation: request context, `OrgScopedRepository`, the query builders                       |
| `entity/`    | The seven base classes, the audit-column subscriber, the cascade soft delete                           |
| `http/`      | `ApiException` and its filter, the zod pipe, `@Public` / `@SkipOrgScope`, cursor paging                |
| `jobs/`      | Advisory locks and alerting — here rather than in `maintenance/`, because the outbox worker wants both |

`sort-order.ts` and `system-user.ts` sit at the root of `shared/` because they
are one exported thing each and belong to no group: fractional indexing for
`sort_order`, and the uuid rows written by the system are attributed to.

## Not in `src/`

`test/` holds the integration suites and has [its own README](../test/README.md).
Unit tests sit beside the code they cover as `*.spec.ts`.
