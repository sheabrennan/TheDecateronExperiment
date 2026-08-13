import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'web',
  plugins: [react()],

  // Served from the custom domain root (see web/public/CNAME), so this only
  // needs overriding for a fork/mirror hosted at a GitHub Pages project path
  // instead (https://<user>.github.io/<repo>/).
  base: process.env.VITE_BASE_PATH || '/',

  server: {
    port: 5173,
    // The engine, the pack and the storage layer all live outside web/, and
    // are imported directly rather than fetched -- there is no API to proxy to
    // any more.
    fs: { allow: ['..'] }
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
