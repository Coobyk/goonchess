import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so the tests run plain Node — no React plugin,
// no Tailwind, no build-time defines. Only the `@/` alias is needed.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
