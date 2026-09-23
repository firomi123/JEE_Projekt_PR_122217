import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors/app-error.js';
import { errorHandler } from './error-handler.js';
import { requestLogger } from './request-logger.js';

/**
 * Builds a minimal app whose only route throws the given value, followed by the
 * real request logger and error handler.
 *
 * @param thrown - Value thrown by `GET /boom`.
 * @returns The Express app.
 */
function appThrowing(thrown: unknown) {
  const app = express();
  app.use(requestLogger(pino({ level: 'silent' })));
  app.get('/boom', () => {
    throw thrown;
  });
  app.get('/boom-async', async () => {
    await Promise.resolve();
    throw thrown;
  });
  app.use(errorHandler());
  return app;
}

describe('errorHandler', () => {
  it('maps ValidationError to 400 with field details', async () => {
    const response = await request(
      appThrowing(new ValidationError([{ path: 'email', message: 'Invalid email' }])),
    ).get('/boom');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [{ path: 'email', message: 'Invalid email' }],
      },
    });
  });

  it('converts a ZodError into field issues', async () => {
    const parsed = z.object({ age: z.number().min(18) }).safeParse({ age: 5 });
    if (parsed.success) throw new Error('expected failure');

    const response = await request(appThrowing(ValidationError.fromZod(parsed.error))).get('/boom');

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([{ path: 'age', message: expect.any(String) }]);
  });

  it('maps NotFoundError to 404 and ForbiddenError to 403 without details', async () => {
    const notFound = await request(appThrowing(new NotFoundError('Document not found'))).get(
      '/boom',
    );
    const forbidden = await request(appThrowing(new ForbiddenError())).get('/boom');

    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
  });

  it('hides unexpected errors behind a generic 500 INTERNAL_ERROR', async () => {
    const response = await request(
      appThrowing(new Error('connection to db-internal-host:5432 failed')),
    ).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('also handles errors thrown by async handlers (rejected promises)', async () => {
    const response = await request(appThrowing(new NotFoundError())).get('/boom-async');

    expect(response.status).toBe(404);
  });

  it('handles thrown non-Error values as 500', async () => {
    const response = await request(appThrowing('just a string')).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });
});
