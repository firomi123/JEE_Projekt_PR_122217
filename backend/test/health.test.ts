import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eventLoopMonitor } from '../src/lib/event-loop.js';
import { buildTestApp, useTestApp, type TestContext } from './helpers/context.js';

/** Unused local port: connections are refused immediately. */
const CLOSED_PORT_URL = '127.0.0.1:1';

describe('GET /health (liveness)', () => {
  const { app } = useTestApp();

  // These tests check liveness in normal operation. Loading the modules of the test
  // file blocks the event loop for a while (much longer with coverage enabled), and
  // that start-up block must not count, so the measurement window starts only after
  // the monitor's timer has fired again. Detecting a real block: metrics.test.ts.
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    eventLoopMonitor.takeMaxDelayMs();
  });

  it('returns 200 with status "ok"', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('is also reachable under /api/health, the path proxied by the frontend nginx', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('GET /health/ready (readiness)', () => {
  const { app } = useTestApp();
  let degraded: TestContext | undefined;

  afterEach(async () => {
    await degraded?.prisma.$disconnect();
    degraded?.s3.destroy();
    degraded = undefined;
  });

  it('returns 200 when PostgreSQL and MinIO are reachable', async () => {
    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ready',
      checks: { database: 'up', storage: 'up' },
    });
  });

  it('is also reachable under /api/health/ready', async () => {
    const response = await request(app).get('/api/health/ready');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ready');
  });

  it('returns 503 with database "down" when the database is unreachable', async () => {
    degraded = buildTestApp({ DATABASE_URL: `postgresql://test:test@${CLOSED_PORT_URL}/none` });

    const response = await request(degraded.app).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'not_ready',
      checks: { database: 'down', storage: 'up' },
    });
  });

  it('returns 503 with storage "down" when MinIO is unreachable', async () => {
    degraded = buildTestApp({ S3_ENDPOINT: `http://${CLOSED_PORT_URL}` });

    const response = await request(degraded.app).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'not_ready',
      checks: { database: 'up', storage: 'down' },
    });
  });

  it('returns 503 with storage "down" when the documents bucket does not exist', async () => {
    degraded = buildTestApp({ S3_BUCKET: 'bucket-that-does-not-exist' });

    const response = await request(degraded.app).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body.checks.storage).toBe('down');
  });

  it('does not expose failure details (host names, driver errors) to the client', async () => {
    degraded = buildTestApp({ DATABASE_URL: `postgresql://test:test@${CLOSED_PORT_URL}/none` });

    const response = await request(degraded.app).get('/health/ready');

    expect(JSON.stringify(response.body)).not.toMatch(/127\.0\.0\.1|ECONNREFUSED|error/i);
  });
});
