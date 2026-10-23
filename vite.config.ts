import { execSync } from 'node:child_process'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function buildCommit() {
  const fromCi = process.env.GITHUB_SHA ?? process.env.CF_PAGES_COMMIT_SHA
  if (fromCi) return fromCi
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // `npm run dev` is the UI; `npm run worker` serves the API on 8787. Anything
  // under /api is the Worker's, everything else stays with Vite.
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
