/* global process */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import posthog from '@posthog/rollup-plugin'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      env.POSTHOG_PERSONAL_API_KEY && posthog({
        personalApiKey: env.POSTHOG_PERSONAL_API_KEY,
        projectId: env.POSTHOG_PROJECT_ID,
      })
    ].filter(Boolean),
    build: {
      sourcemap: true,
      outDir: '../static/dist',
      emptyOutDir: true,
      // Lowered target to es2018 to ensure older browsers (Chrome 90+, Android 90+,
      // Safari 13+) can execute the JavaScript bundle cleanly without white-screening.
      target: ['es2018', 'chrome90', 'safari13', 'edge90', 'firefox88'],
      rollupOptions: {
        output: {
          // Split heavyweight vendor libs into their own long-cached
          // chunks. Before: framer-motion was being duplicated into the
          // SearchInput chunk (111 KB) AND in the main bundle. Now:
          // single framer-motion chunk loaded once, cached for a year
          // (Vite content-hashes it). The main bundle and lazy route
          // chunks both reference it, no duplicate code.
          // Rolldown (Vite 8) requires manualChunks as a function.
          manualChunks(id) {
            if (id.includes('node_modules/framer-motion/')) {
              return 'framer-motion'
            }
            if (
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router/') ||
              id.includes('node_modules/react-router-dom/') ||
              /node_modules[\\/]react[\\/]/.test(id)
            ) {
              return 'react-vendor'
            }
          },
        },
      },
    },
    server: {
      proxy: {
        '/api': 'http://localhost:5000',
        '/auth': 'http://localhost:5000',
      },
    },
  }
})
