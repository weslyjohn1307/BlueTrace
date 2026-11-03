/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      ...(process.env.VITE_GITHUB_PAGES === 'true'
        ? { input: fileURLToPath(new URL('./showcase.html', import.meta.url)) }
        : {}),
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three-vendor'
          if (id.includes('/node_modules/gsap/')) return 'gsap-vendor'
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Playwright tests live in tests/playwright/ — exclude from Vitest
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/playwright/**'],
  },
})

