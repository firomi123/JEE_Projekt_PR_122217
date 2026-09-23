import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Backend the dev server forwards /api to: API_PROXY_TARGET (set by the end-to-end
// tests), otherwise the PORT from the repository-root .env, default 3000.
const rootEnv = loadEnv('development', '..', '');
const apiTarget = process.env.API_PROXY_TARGET ?? `http://localhost:${rootEnv.PORT || '3000'}`;

/** Forward /api to the backend (same origin as in Docker behind nginx). */
const proxy = { '/api': apiTarget };

export default defineConfig({
  plugins: [react()],
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
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
