import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { beasties } from 'vite-plugin-beasties'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Critical-CSS extraction. PSI flagged /assets/index-*.css as a
    // render-blocking request costing ~150ms LCP on mobile. Beasties
    // walks the rendered HTML, picks out the CSS rules used above the
    // fold, inlines those into <head>, and rewrites the original
    // <link rel="stylesheet"> as a non-blocking preload that swaps in
    // once loaded.
    //
    // pruneSource is OFF: beasties 0.4.2 crashes on inline <style>
    // tags when pruning (the boot-loader CSS in index.html). The cost
    // is that inlined rules get duplicated in the external CSS file —
    // a few KiB at most, acceptable for the LCP win.
    beasties({
      options: {
        preload: 'swap',
        pruneSource: false,
        inlineThreshold: 4000,
      },
      filter: (path) => path.endsWith('.html'),
    }),
  ],
  build: {
    outDir: '../static/dist',
    emptyOutDir: true,
    // target=es2020 drops the legacy syntax transforms Vite ships by
    // default (target=modules ~= ES2018 modulo a few features). Saves
    // ~19 KiB of polyfill code per Lighthouse, and every browser we
    // care about (Chrome 80+, Safari 14+, Firefox 78+) is on >2 years
    // of ES2020 support — millennia in browser-years.
    target: 'es2020',
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
})
