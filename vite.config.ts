/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'path'
import fs from 'fs'
import { applyTrialDays } from './src/lib/trialDaysHtml'
import { DEFAULT_TRIAL_DAYS } from './src/lib/tiers'

// Routes that should serve app.html instead of index.html (marketing)
const APP_ROUTES = [
  '/login', '/reset-password', '/dashboard', '/home', '/setup', '/obligations', '/financial', '/funds', '/issues',
  '/building', '/compliance', '/archives', '/voting', '/boardroom',
  '/board-ops', '/property-log', '/community', '/my-unit', '/account',
  '/admin', '/portfolio', '/support', '/subscription', '/association-team', '/cases',
]

const STATIC_PAGES: Record<string, string> = {
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

/**
 * Keeps the free trial length on the marketing pages in step with the Admin
 * Console. At build it asks the backend for the current length and writes it
 * into index.html, the guides and llms.txt (see src/lib/trialDaysHtml.ts). It
 * also emits /site-config.js, which tells public/trial-days.js where to ask
 * again in the browser. With no backend configured, or if the request fails,
 * the pages keep the fallback number already in the source.
 */
function trialDaysPlugin(): Plugin {
  let supabaseUrl = ''
  let anonKey = ''
  let days = DEFAULT_TRIAL_DAYS
  let outDir = 'dist'

  const siteConfig = () =>
    `window.ONETWO_SITE=${JSON.stringify({ supabaseUrl, anonKey })};\n`

  async function fetchTrialDays(): Promise<number> {
    if (!supabaseUrl || !anonKey) return DEFAULT_TRIAL_DAYS
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_trial_days`, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(5000),
      })
      const value: unknown = res.ok ? await res.json() : null
      // 0 is a real answer: the trial is turned off.
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : DEFAULT_TRIAL_DAYS
    } catch {
      return DEFAULT_TRIAL_DAYS
    }
  }

  return {
    name: 'trial-days',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, 'VITE_')
      supabaseUrl = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
      anonKey = env.VITE_SUPABASE_ANON_KEY || ''
      outDir = path.resolve(config.root, config.build.outDir)
    },
    async buildStart() {
      days = await fetchTrialDays()
    },
    transformIndexHtml(html) {
      return applyTrialDays(html, days)
    },
    configureServer(server) {
      server.middlewares.use('/site-config.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript')
        res.end(siteConfig())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'site-config.js', source: siteConfig() })
    },
    // Files under public/ are copied as they are, so rewrite their copies in the output.
    closeBundle() {
      const guides = path.join(outDir, 'guides')
      const files = [
        path.join(outDir, 'llms.txt'),
        ...(fs.existsSync(guides) ? fs.readdirSync(guides).filter(f => f.endsWith('.html')).map(f => path.join(guides, f)) : []),
      ]
      for (const file of files) {
        if (!fs.existsSync(file)) continue
        const before = fs.readFileSync(file, 'utf8')
        const after = applyTrialDays(before, days)
        if (after !== before) fs.writeFileSync(file, after)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    multiPagePlugin(),
    trialDaysPlugin(),
    process.env.SENTRY_AUTH_TOKEN
      ? sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          sourcemaps: {
            filesToDeleteAfterUpload: ['./dist/**/*.map'],
          },
        })
      : null,
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        app: path.resolve(__dirname, 'app.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
  },
})
