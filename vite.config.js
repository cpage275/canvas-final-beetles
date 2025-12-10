import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/canvas-final-beetles/', // GitHub Pages repo name
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
})
