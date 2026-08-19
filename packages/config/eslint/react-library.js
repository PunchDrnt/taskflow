import reactHooksPlugin from 'eslint-plugin-react-hooks'
import globals from 'globals'

import { baseConfig } from './base.js'

/** @type {import("eslint").Linter.Config[]} */
export const reactLibraryConfig = [
  ...baseConfig,
  {
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
    },
  },
]

export default reactLibraryConfig
