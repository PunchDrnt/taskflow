import path from 'node:path'

function eslintCommand(workspaceDir, workspaceName) {
  return (filenames) => {
    const relativeFiles = filenames.map((file) =>
      path.relative(path.resolve(workspaceDir), file),
    )
    return `yarn workspace ${workspaceName} eslint --fix --max-warnings 0 ${relativeFiles.join(' ')}`
  }
}

// ESLint is scoped per workspace because flat config resolves from the process
// cwd, not per-file. These are the workspaces that own an eslint.config.mjs and
// a lint script - the same three `turbo run lint` covers. @repo/config has
// neither, so its files are formatted by Prettier but not linted.
export default {
  '*.{js,jsx,ts,tsx,mjs,cjs,json,md,mdx,css}': 'prettier --write',
  'apps/web/client/**/*.{ts,tsx}': eslintCommand(
    'apps/web/client',
    '@web/client',
  ),
  'apps/api/core/**/*.ts': eslintCommand('apps/api/core', '@api/core'),
  'packages/ui/**/*.{ts,tsx}': eslintCommand('packages/ui', '@repo/ui'),
}
