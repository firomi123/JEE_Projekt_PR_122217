import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/context.js';

describe('API documentation', () => {
  const { app } = useTestApp();

  it('serves an OpenAPI 3.0 document that lists every implemented endpoint', async () => {
    const response = await request(app).get('/api/docs/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toMatch(/^3\.0\./);
    const operations = Object.entries(response.body.paths as Record<string, object>).flatMap(
      ([path, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(operations.sort()).toEqual(
      [
        'GET /health',
        'GET /health/ready',
        'POST /api/auth/register',
        'POST /api/auth/login',
        'GET /api/auth/me',
        'GET /api/profile',
        'PUT /api/profile',
      ].sort(),
    );
  });

  it('documents the registration rules generated from the shared Zod schema', async () => {
    const response = await request(app).get('/api/docs/openapi.json');

    const register = response.body.components.schemas.RegisterRequest;
    expect(register.required).toEqual(['username', 'email', 'password', 'confirmPassword']);
    expect(register.properties.username).toMatchObject({ minLength: 3, maxLength: 30 });
    expect(register.properties.password).toMatchObject({ minLength: 8, maxLength: 128 });
  });

  it('serves Swagger UI at /api/docs/', async () => {
    const response = await request(app).get('/api/docs/');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.text).toContain('swagger-ui');
  });
});
