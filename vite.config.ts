/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Routes that should serve app.html instead of index.html (marketing)
const APP_ROUTES = [
  '/login', '/reset-password', '/dashboard', '/financial', '/issues',
  '/building', '/compliance', '/archives', '/voting', '/boardroom',
  '/board-ops', '/property-log', '/community', '/my-unit', '/account',
  '/admin',
]

const STATIC_PAGES: Record<string, string> = {
  '/demo': '/demo.html',
}

function multiPagePlugin(): Plugin {
  return {
    name: 'multi-page-spa',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url?.split('?')[0] || ''
        if (STATIC_PAGES[url]) {
          req.url = STATIC_PAGES[url]
        } else if (APP_ROUTES.some(r => url === r || url.startsWith(r + '/'))) {
          req.url = '/app.html'
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), multiPagePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        app: path.resolve(__dirname, 'app.html'),
        demo: path.resolve(__dirname, 'demo.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.ts'],
  },
})
