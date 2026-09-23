import { testEnv } from '../backend/test/env';

/** Port of the backend started for the end-to-end tests. */
export const E2E_BACKEND_PORT = 3101;
/** Port of the Vite dev server started for the end-to-end tests. */
export const E2E_FRONTEND_PORT = 5174;

/**
 * Environment of the backend under end-to-end test: the same throwaway PostgreSQL
 * and MinIO as the API tests (docker-compose.test.yml), a high login rate limit
 * (all tests come from 127.0.0.1) and warnings-only logging.
 */
export const e2eBackendEnv: Record<string, string> = {
  ...testEnv,
  PORT: String(E2E_BACKEND_PORT),
  LOG_LEVEL: 'warn',
  LOGIN_RATE_LIMIT_MAX: '1000',
};
