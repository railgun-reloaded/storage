import { defineConfig } from 'vite'

// No aliases and no Node polyfills: the fixture must consume the packed
// package exactly as a real application would. The packages are excluded
// from dependency pre-bundling so the dev server serves their ESM sources
// as-is; the production build (which this fixture is verified against)
// bundles them with Rollup, resolving the worker and wasm assets from the
// publication allowlist.
export default defineConfig({
  optimizeDeps: {
    exclude: ['@railgun-reloaded/storage', '@sqlite.org/sqlite-wasm'],
  },
})
