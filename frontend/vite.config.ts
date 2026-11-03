/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      ...(process.env.VITE_GITHUB_PAGES === 'true'
        ? { input: fileURLToPath(new URL('./showcase.html', import.meta.url)) }
        : {}),
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/')
          if (normalized.includes('/node_modules/three/')) return 'three-vendor'
          if (normalized.includes('/node_modules/gsap/')) return 'gsap-vendor'
          if (normalized.includes('/node_modules/lucide-react/')) return 'lucide-vendor'
          if (
            normalized.includes('/node_modules/react/') ||
            normalized.includes('/node_modules/react-dom/') ||
            normalized.includes('/node_modules/react-router')
          ) {
            return 'react-vendor'
          }
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

