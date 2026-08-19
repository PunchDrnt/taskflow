import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

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
