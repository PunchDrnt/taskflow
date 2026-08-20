import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const here = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  transpilePackages: ['@repo/ui'],

  // Emits .next/standalone with only the files the server actually reaches,
  // so the runtime image needs no node_modules of its own.
  output: 'standalone',

  // Without this Next traces from this directory and misses the hoisted
  // node_modules at the repository root, producing a server that cannot
  // resolve react.
  outputFileTracingRoot: join(here, '../../..'),
}

export default nextConfig
