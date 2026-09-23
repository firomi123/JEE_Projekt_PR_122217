import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/context.js';

describe('uniform error responses', () => {
  const { app } = useTestApp();

  it('returns 404 NOT_FOUND in the uniform format for an unknown path', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route GET /api/does-not-exist not found' },
    });
  });

  it('returns 404 for an unsupported method on an existing path', async () => {
    const response = await request(app).delete('/health');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 INVALID_JSON for a malformed JSON body', async () => {
    const response = await request(app)
      .post('/api/anything')
      .set('Content-Type', 'application/json')
      .send('{"username": ');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
    });
  });

  it('returns 413 PAYLOAD_TOO_LARGE for a JSON body over 1 MB', async () => {
    const response = await request(app)
      .post('/api/anything')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(1024 * 1024 + 1) }));

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('request id', () => {
  const { app } = useTestApp();

  it('generates a UUID request id and returns it in X-Request-Id', async () => {
    const response = await request(app).get('/health');

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('reuses a well-formed X-Request-Id sent by the client', async () => {
    const response = await request(app).get('/health').set('X-Request-Id', 'trace-abc_123');

    expect(response.headers['x-request-id']).toBe('trace-abc_123');
  });

  it('ignores a malformed X-Request-Id and generates a new one', async () => {
    const response = await request(app).get('/health').set('X-Request-Id', 'bad id\twith spaces');

    expect(response.headers['x-request-id']).not.toBe('bad id\twith spaces');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
