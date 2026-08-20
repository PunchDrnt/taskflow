import { nestjsConfig } from '@repo/config/eslint/nestjs'

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nestjsConfig,
  {
    // A service holding a plain TypeORM Repository can read any org's rows.
    // OrgScopedRepository is the only thing standing between tenants, so
    // reaching past it has to be a deliberate, visible act rather than an
    // import someone added without thinking about it.
    //
    // Scoped to modules: the shared/ and database/ directories are where the
    // wrapper itself is built, and test/ needs the raw repository to set up
    // fixtures the wrapper would scope.
    files: ['src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@nestjs/typeorm',
              importNames: ['InjectRepository'],
              message:
                'Inject OrgScopedRepository instead. @InjectRepository hands ' +
                'you an unscoped Repository that can read every org. If an ' +
                'endpoint genuinely must cross orgs, mark it @SkipOrgScope() ' +
                'and say so in review.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'TSTypeReference > TSQualifiedName[left.name="typeorm"][right.name="Repository"], TSTypeAnnotation TSTypeReference > Identifier[name="Repository"]',
          message:
            'Do not type a property or parameter as Repository. Use ' +
            "OrgScopedRepository, which cannot return another org's rows.",
        },
      ],
    },
  },
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
