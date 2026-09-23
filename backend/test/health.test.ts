import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('GET /health (liveness)', () => {
  it('returns 200 with status "ok"', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('is also reachable under /api/health, the path proxied by the frontend nginx', async () => {
    const response = await request(createApp()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
