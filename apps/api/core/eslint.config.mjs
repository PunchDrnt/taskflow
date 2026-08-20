import { nestjsConfig } from '@repo/config/eslint/nestjs'

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nestjsConfig,
  {
    // `typeorm migration:create` emits
    //   import { MigrationInterface, QueryRunner } from 'typeorm'
    // Both are types only, and TypeORM's ESM entry point does not export
    // them, so that import passes `nest build` (CommonJS tolerates the
    // undefined binding) and throws at load time under Vitest. Forcing
    // `import type` here fixes it on commit via lint-staged.
    //
    // Scoped to migrations on purpose: the same rule applied repo-wide
    // rewrites NestJS constructor injection, and DI resolves those
    // dependencies from `design:paramtypes` metadata that `import type`
    // erases — providers would start arriving as undefined at runtime.
    files: ['src/database/migrations/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
]
