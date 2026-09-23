import { defineConfig } from 'vitest/config';
import { testEnv } from './test/env.js';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    env: testEnv,
    globalSetup: ['./test/global-setup.ts'],
    // Test files share one database that is truncated before each test.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
