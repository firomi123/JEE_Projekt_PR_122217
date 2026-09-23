import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { pdfFile } from './fixtures/files.js';
import { buildTestApp, useTestApp, type TestContext } from './helpers/context.js';
import { uploadDocument } from './helpers/documents.js';
import { createUser, DEFAULT_PASSWORD, loginAs } from './helpers/users.js';

/**
 * Reads one sample value from the Prometheus text exposition.
 *
 * @param metrics - Body of `GET /metrics`.
 * @param name - Metric name (with suffix, e.g. `_total`, `_count`).
 * @param labels - Labels that must all be present on the sample.
 * @returns The value, or 0 when the sample does not exist (yet).
 */
function sample(metrics: string, name: string, labels: Record<string, string> = {}): number {
  for (const line of metrics.split('\n')) {
    if (!line.startsWith(`${name}{`) && !line.startsWith(`${name} `)) continue;
    const matches = Object.entries(labels).every(([key, value]) =>
      line.includes(`${key}="${value}"`),
    );
    if (matches) return Number(line.slice(line.lastIndexOf(' ') + 1));
  }
  return 0;
}

describe('GET /metrics', () => {
  const { app, prisma } = useTestApp();
  const scrape = async () => (await request(app).get('/metrics')).text;

  it('returns the Prometheus text format with Node.js default metrics', async () => {
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/plain;/);
    expect(response.headers['content-type']).toContain('version=0.0.4');
    expect(response.text).toContain('# TYPE process_cpu_user_seconds_total counter');
    expect(response.text).toContain('nodejs_eventloop_lag_seconds');
    expect(response.text).toContain('nodejs_heap_size_used_bytes');
  });

  it('counts HTTP requests by method, route template and status code', async () => {
    const before = sample(await scrape(), 'http_requests_total', {
      method: 'GET',
      route: '/api/documents/:id',
      status_code: '404',
    });
    const { authHeader } = await loginAs(app, prisma);

    await request(app)
      .get('/api/documents/5f0e7c7a-0000-4000-8000-000000000000')
      .set('Authorization', authHeader);

    const after = sample(await scrape(), 'http_requests_total', {
      method: 'GET',
      route: '/api/documents/:id',
      status_code: '404',
    });
    expect(after).toBe(before + 1);
    expect(await scrape()).toContain('http_request_duration_seconds_bucket');
  });

  it('labels unknown paths as "unmatched" instead of the raw URL (bounded label values)', async () => {
    await request(app).get('/api/some/random/path/12345');

    const metrics = await scrape();
    expect(
      sample(metrics, 'http_requests_total', { route: 'unmatched', status_code: '404' }),
    ).toBeGreaterThan(0);
    expect(metrics).not.toContain('/api/some/random/path/12345');
  });

  it('counts failed logins but not successful ones', async () => {
    const user = await createUser(prisma);
    const before = sample(await scrape(), 'auth_login_failures_total');

    await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: 'Zle-haslo1' });
    await request(app).post('/api/auth/login').send({ username: 'nie_istnieje', password: 'x' });
    await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: DEFAULT_PASSWORD });

    expect(sample(await scrape(), 'auth_login_failures_total')).toBe(before + 2);
  });

  it('counts uploaded documents by type and records their size', async () => {
    const { authHeader } = await loginAs(app, prisma);
    const before = await scrape();
    const file = pdfFile();

    await uploadDocument(app, authHeader, { type: 'WZ', file });

    const after = await scrape();
    expect(sample(after, 'document_uploads_total', { type: 'WZ' })).toBe(
      sample(before, 'document_uploads_total', { type: 'WZ' }) + 1,
    );
    expect(sample(after, 'document_upload_size_bytes_sum')).toBe(
      sample(before, 'document_upload_size_bytes_sum') + file.length,
    );
  });

  it('measures database query durations', async () => {
    await request(app).get('/health/ready');

    expect(sample(await scrape(), 'db_query_duration_seconds_count')).toBeGreaterThan(0);
  });

  it('is not exposed under /api (the frontend nginx only forwards /api/*)', async () => {
    expect((await request(app).get('/api/metrics')).status).toBe(404);
  });
});

describe('liveness watchdog: blocked event loop', () => {
  let ctx: TestContext;

  afterEach(async () => {
    await ctx.prisma.$disconnect();
    ctx.s3.destroy();
  });

  it('reports 503 after the event loop was blocked longer than the threshold', async () => {
    ctx = buildTestApp({ EVENT_LOOP_LAG_THRESHOLD_MS: '200' });
    await request(ctx.app).get('/health'); // resets the measurement window

    const end = Date.now() + 600;
    while (Date.now() < end) {
      // Busy loop: nothing else can run on the event loop meanwhile.
    }
    const blocked = await request(ctx.app).get('/health');
    const recovered = await request(ctx.app).get('/health');

    expect(blocked.status).toBe(503);
    expect(blocked.body).toEqual({
      status: 'unhealthy',
      reason: 'event_loop_lag',
      lagMs: expect.any(Number),
    });
    expect(blocked.body.lagMs).toBeGreaterThanOrEqual(500);
    expect(recovered.status).toBe(200);
  });
});
