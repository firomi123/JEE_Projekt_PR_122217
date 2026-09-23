import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';

/** Body of every error response: `{ error: { code, message, details? } }`. */
export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Reads the `type` tag that Express' body parser puts on its errors.
 *
 * @param err - Any thrown value.
 * @returns The tag (e.g. `entity.parse.failed`, `entity.too.large`) or `undefined`.
 */
function bodyParserErrorType(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const type = (err as { type?: unknown }).type;
  return typeof type === 'string' ? type : undefined;
}

/**
 * Creates the central error handler, registered as the last middleware.
 *
 * Maps errors to the uniform response format:
 * - {@link AppError} (and subclasses) → its own status, code, message and details;
 * - malformed JSON body → 400 `INVALID_JSON`;
 * - body larger than the parser limit → 413 `PAYLOAD_TOO_LARGE`;
 * - anything else → 500 `INTERNAL_ERROR` with a generic message, so stack traces
 *   and internal details never reach the client.
 *
 * Side effects: logs unexpected errors (level `error`, with stack) through the
 * request's logger, so the entry carries the `requestId`. Client errors are
 * already logged by the request logger at level `warn`.
 *
 * @returns An Express error-handling middleware (four arguments).
 */
export function errorHandler(): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    let status: number;
    let body: ErrorResponseBody;
    const parserError = bodyParserErrorType(err);

    if (err instanceof AppError) {
      status = err.status;
      body = { error: { code: err.code, message: err.message } };
      if (err.details !== undefined) body.error.details = err.details;
    } else if (parserError === 'entity.parse.failed') {
      status = 400;
      body = { error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } };
    } else if (parserError === 'entity.too.large') {
      status = 413;
      body = { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } };
    } else {
      req.log.error({ err }, 'Unhandled error');
      status = 500;
      body = { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } };
    }

    res.status(status).json(body);
  };
}
