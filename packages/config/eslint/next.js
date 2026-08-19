import nextPlugin from '@next/eslint-plugin-next'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import globals from 'globals'

import { baseConfig } from './base.js'

// NOTE: eslint-plugin-react's peer range still caps at eslint ^9.7, so it's
// intentionally left out until it publishes ESLint 10 support. react-hooks +
// the Next.js plugin cover hooks correctness and Next-specific rules in the
// meantime.
/** @type {import("eslint").Linter.Config[]} */
export const nextConfig = [
  ...baseConfig,
  {
    plugins: {
      'react-hooks': reactHooksPlugin,
      '@next/next': nextPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
]

export default nextConfig
