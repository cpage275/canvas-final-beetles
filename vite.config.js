import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // Use relative paths for assets
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
})
