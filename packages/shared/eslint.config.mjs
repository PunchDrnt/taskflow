import { baseConfig } from '@repo/config/eslint/base'

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,
  {
    rules: {
      // @repo/shared is imported by both the API and the web client, so it
      // must stay framework-free — zod and plain types only. See
      // .claude/docs/architecture.md.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*', 'typeorm', 'typeorm/*'],
              message:
                '@repo/shared must not depend on server frameworks — it ships to the browser too. Keep it to zod, types, enums and constants.',
            },
            {
              group: ['react', 'react-dom', 'next', 'next/*'],
              message:
                '@repo/shared must not depend on the web framework — it runs in the NestJS API too.',
            },
          ],
        },
      ],
    },
  },
]
