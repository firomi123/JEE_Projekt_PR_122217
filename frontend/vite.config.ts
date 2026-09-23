import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// The backend port comes from the repository-root .env (PORT), default 3000.
const rootEnv = loadEnv('development', '..', '');
const apiTarget = `http://localhost:${rootEnv.PORT || '3000'}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin /api in development, mirroring the nginx proxy in Docker.
    // Also means only one port needs `adb reverse` when testing on a phone.
    proxy: {
      '/api': apiTarget,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
