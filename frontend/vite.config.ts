import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Backend the dev server forwards /api to: API_PROXY_TARGET (set by the end-to-end
// tests), otherwise the PORT from the repository-root .env, default 3000.
const rootEnv = loadEnv('development', '..', '');
const apiTarget = process.env.API_PROXY_TARGET ?? `http://localhost:${rootEnv.PORT || '3000'}`;

/** Forward /api to the backend (same origin as in Docker behind nginx). */
const proxy = { '/api': apiTarget };

/** Brand colour used by the manifest and the browser UI (same as `--color-primary`). */
const THEME_COLOR = '#1f4e79';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Aplikacja kierowcy – dokumenty przewozowe',
        short_name: 'Kierowca',
        description: 'Zdjęcia, wersje i statusy dokumentów przewozowych (CMR, WZ) w telefonie.',
        lang: 'pl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: THEME_COLOR,
        background_color: '#f3f5f8',
        categories: ['business', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Only the application shell (JS, CSS, HTML, icons) is cached for offline use.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Client-side routes open the cached index.html; API paths never do.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Documents are confidential: API responses (data and files) are never
        // stored by the service worker, they always come from the network.
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
        ],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: Number(process.env.FRONTEND_DEV_PORT ?? 5173),
    strictPort: true,
    // Same-origin /api in development, mirroring the nginx proxy in Docker.
    // Also means only one port needs `adb reverse` when testing on a phone.
    proxy,
  },
  // `vite preview` serves the production build; the end-to-end tests use it.
  preview: {
    port: Number(process.env.FRONTEND_DEV_PORT ?? 4173),
    strictPort: true,
    proxy,
  },
  // Source maps only for the end-to-end coverage run (E2E_COVERAGE=1); the
  // production bundle does not publish the original sources.
  build: { sourcemap: process.env.E2E_COVERAGE === '1' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/vite-env.d.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
    },
  },
});
