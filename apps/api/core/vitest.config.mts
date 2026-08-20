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
