import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend lives in /client, builds to /dist which Express serves in production.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' }
  }
})
