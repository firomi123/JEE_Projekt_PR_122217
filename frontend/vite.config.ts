import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin /api in development, mirroring the nginx proxy in Docker.
    // Also means only one port needs `adb reverse` when testing on a phone.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
