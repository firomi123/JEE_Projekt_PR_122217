import { defineConfig, devices } from '@playwright/test';
import { COVERAGE_ENABLED } from './coverage';
import { E2E_BACKEND_PORT, E2E_FRONTEND_PORT, e2eBackendEnv } from './env';

/**
 * End-to-end UI tests. By default Playwright starts its own backend (port 3101, on
 * the test database from docker-compose.test.yml) and a production build of the
 * frontend served by `vite preview` (port 5174, forwarding /api to that backend). Set E2E_BASE_URL to run against an already
 * running deployment instead (e.g. the Docker stack at http://localhost:8090).
 */
const externalBaseUrl = process.env.E2E_BASE_URL;
const baseURL = externalBaseUrl ?? `http://localhost:${E2E_FRONTEND_PORT}`;

export default defineConfig({
  testDir: './tests',
  globalSetup: externalBaseUrl ? undefined : './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  fullyParallel: true,
  // One worker: every registration and login costs an argon2id hash (64 MiB,
  // 3 passes), and the camera tests decode and compress 12-megapixel photos, all
  // on the same machine that runs the browsers, the backend and the databases.
  // Parallel browsers made tests time out; serial runs are slower but stable.
  workers: 1,
  forbidOnly: !!process.env.CI,
  // One retry: a test that passes only on the second attempt is reported as "flaky".
  retries: process.env.CI ? 2 : 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'pl-PL',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        launchOptions: {
          // Fake camera for the capture flow tests (Stage 9).
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
      },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : [
        {
          command: 'npx tsx src/server.ts',
          cwd: '../backend',
          env: e2eBackendEnv,
          url: `http://localhost:${E2E_BACKEND_PORT}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
        {
          // Production build served by `vite preview`: fast and deterministic, and it
          // tests the same bundle that ships (the dev server compiles on first load).
          command: 'npx vite build --logLevel warn && npx vite preview',
          cwd: '../frontend',
          env: {
            API_PROXY_TARGET: `http://localhost:${E2E_BACKEND_PORT}`,
            // Source maps only for coverage runs (never in the production image).
            ...(COVERAGE_ENABLED ? { E2E_COVERAGE: '1' } : {}),
            FRONTEND_DEV_PORT: String(E2E_FRONTEND_PORT),
          },
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
