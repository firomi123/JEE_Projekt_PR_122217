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
  OFFICE_USERNAME: 'biuro_e2e',
  OFFICE_PASSWORD: 'Biuro-E2e-Haslo1!',
};

/**
 * Office account used by the office scenarios: the one the E2E backend creates at
 * startup, or – against another deployment (E2E_BASE_URL) – the one given in
 * E2E_OFFICE_USERNAME / E2E_OFFICE_PASSWORD.
 */
export const e2eOffice = {
  username: process.env.E2E_OFFICE_USERNAME ?? e2eBackendEnv.OFFICE_USERNAME!,
  password: process.env.E2E_OFFICE_PASSWORD ?? e2eBackendEnv.OFFICE_PASSWORD!,
};
