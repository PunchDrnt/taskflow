/** @type {import("prettier").Config} */
export default {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 80,
  tabWidth: 2,
  plugins: [
    '@ianvs/prettier-plugin-sort-imports',
    'prettier-plugin-tailwindcss',
  ],
  // Sentry instruments modules as they load, so apps/api/core's ./instrument
  // has to be imported before anything else. Side-effect imports are barriers
  // by default, which sounds protective and is not: it means Prettier will not
  // move ./instrument down, but also will not move anything back out from
  // above it — and an IDE auto-import lands at line 1. Naming it safe to
  // reorder and giving it the first group makes Prettier put it back instead.
  // test/sentry.spec.ts asserts the result, since this config could change.
  importOrderSafeSideEffects: ['^\\./instrument$'],
  importOrder: [
    '^\\./instrument$',
    '<BUILTIN_MODULES>',
    '<THIRD_PARTY_MODULES>',
    '',
    '^@repo/(.*)$',
    '',
    '^[./]',
  ],
  importOrderTypeScriptVersion: '6.0.3',
  importOrderParserPlugins: ['typescript', 'jsx', 'decorators-legacy'],
}
