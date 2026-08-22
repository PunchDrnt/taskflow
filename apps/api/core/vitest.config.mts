import { existsSync } from 'node:fs'
import { join } from 'node:path'
import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

// Vitest does not read .env the way Nest's ConfigModule does, and the repo
// keeps a single .env at its root. Load it so integration tests can find
// DATABASE_URL_TEST; without it they skip rather than fail (see test/README.md).
const rootEnvFile = join(import.meta.dirname, '..', '..', '..', '.env')
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile)
}

export default defineConfig({
  resolve: {
    // `#shared/*` is a package.json subpath import, which resolves to dist/ so
    // that plain `node dist/main.js` works with no loader and no build step.
    // Vitest runs the TypeScript sources instead, so without this it would test
    // whatever the last `nest build` left behind. An alias resolves before
    // Node's own condition matching, which makes the source win here and only
    // here.
    alias: [
      {
        find: /^#shared\/(.*)$/,
        replacement: join(import.meta.dirname, 'src', 'shared', '$1'),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    // Integration tests share one Postgres database, so they must not run
    // concurrently across files — see test/README.md.
    fileParallelism: false,
  },
  // esbuild (vitest's default) cannot emit decorator metadata, which NestJS
  // DI and TypeORM both rely on. SWC handles it.
  plugins: [swc.vite({ module: { type: 'es6' } })],
})
