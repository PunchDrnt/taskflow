# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
```

To target a single workspace, use `yarn workspace <name> <script>`, e.g.:

```bash
yarn workspace @web/client dev
yarn workspace @api/core build
yarn workspace @repo/ui lint
```

Workspace names: `@web/client` (apps/web/client), `@api/core` (apps/api/core), `@repo/ui` (packages/ui), `@repo/config` (packages/config).

There is no test runner configured yet (no Jest/Vitest, no `*.spec.*`/`*.test.*` files), despite `@nestjs/testing` being installed in `@api/core`.

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

**`apps/api/core`** — NestJS 11 API. Entry point is `src/main.ts`: bootstraps with `nestjs-pino` for logging (pretty-printed outside `NODE_ENV=production`, level via `LOG_LEVEL`) and Swagger docs mounted at `/docs`. Listens on `PORT` env var (default 3001). `src/health/` holds `@nestjs/terminus` health checks at `/health`, `/health/live`, and `/health/ready` — when adding a dependency (database, cache, upstream API), register its indicator in the **readiness** list in `health.controller.ts`, never in liveness, since a failing dependency should stop traffic rather than restart the container.

**`packages/ui`** (`@repo/ui`) — Shared React component library built on `@base-ui/react` primitives + `class-variance-authority` + Tailwind. Each component lives in its own directory under `src/components/<name>/index.tsx` and is exported individually via the package's `exports` map (`./components/*` → `./src/components/*/index.tsx`), not as a single barrel file — import components by their specific path, not from a package root. Also exports `./globals.css`, `./hooks/*`, and `./lib/*`.

**`packages/config`** (`@repo/config`) — Single source of truth for lint/type/format config, consumed by every other workspace via `workspace:*`:

- `eslint/base.js` — shared flat config (ESLint 10 + typescript-eslint + eslint-config-prettier), extended by `eslint/nestjs.js`, `eslint/next.js`, and `eslint/react-library.js` for stack-specific rules (e.g. Nest disables some OOP-unfriendly TS rules; Next/react-library add `eslint-plugin-react-hooks` and, for Next, `@next/eslint-plugin-next`).
- `typescript/base.json` extended by `typescript/nextjs.json`, `typescript/nestjs.json`, `typescript/react-library.json`.
- `prettier/index.js` — shared Prettier config.
- `tailwind/theme.css` — shared Tailwind v4 theme, pulled into `@repo/ui`'s and the web app's global styles.

When changing lint/type/format behavior for more than one workspace, change it here rather than in the individual app.

## Notes

- `eslint-plugin-react` is intentionally omitted from `eslint/next.js` — its peer range still caps at ESLint ^9.7 and hasn't published ESLint 10 support yet; `eslint-plugin-react-hooks` + `@next/eslint-plugin-next` cover the gap in the meantime. Revisit once upstream catches up.
- ESLint's flat config (`eslint.config.mjs`) is resolved from the process's cwd, not per-file directory cascading — that's why each workspace has its own `eslint.config.mjs` and its own `lint` script (run with that workspace as cwd) rather than a single root config.
- Pre-commit hooks (Husky + lint-staged, configured in `lint-staged.config.mjs`) run Prettier and workspace-scoped ESLint `--fix` on staged files automatically. This isn't a substitute for running `yarn lint`/`yarn check-types` before pushing — it only catches auto-fixable issues and only on staged files.
- This repo is intended to be copied as a starting point for new projects (see README.md's "Using this as a starter" section) — keep it dependency-light and free of project-specific business logic.
