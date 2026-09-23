/**
 * Environment of the test run. It points at the throwaway PostgreSQL and MinIO from
 * docker-compose.test.yml (`npm run test:infra:up`); the credentials are test-only.
 * Used by vitest.config.ts (`test.env`, applied in the test workers) and by
 * test/global-setup.ts (runs in the main process, which does not receive `test.env`).
 */
export const testEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5433/driver_docs_test',
  S3_ENDPOINT: 'http://127.0.0.1:9100',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'documents-test',
  S3_ACCESS_KEY: 'testminio',
  S3_SECRET_KEY: 'testminio-secret',
  JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-characters',
  JWT_EXPIRES_IN: '1h',
  MASTER_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};
