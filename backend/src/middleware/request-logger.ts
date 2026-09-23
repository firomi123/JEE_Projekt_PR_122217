import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

/** Accepted format of a client-supplied `X-Request-Id` (e.g. from nginx or a test). */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Picks the id of an incoming request and echoes it in the `X-Request-Id` response header.
 *
 * @param req - Incoming request; its `X-Request-Id` header is reused when it matches
 *   {@link REQUEST_ID_PATTERN}, otherwise a random UUID is generated.
 * @param res - Response; gets the `X-Request-Id` header (side effect).
 * @returns The request id.
 */
function requestId(req: IncomingMessage, res: ServerResponse): string {
  const header = req.headers['x-request-id'];
  const id = typeof header === 'string' && REQUEST_ID_PATTERN.test(header) ? header : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

/**
 * Checks whether a request is a successful-path liveness probe that should not be
 * logged (Docker polls `/health` every 10 s). Readiness probes are still logged.
 *
 * @param req - Incoming request.
 * @returns `true` for `GET /health` and `GET /api/health`.
 */
function isLivenessProbe(req: IncomingMessage): boolean {
  const path = req.url?.split('?')[0];
  return path === '/health' || path === '/api/health';
}

/**
 * Creates the request-logging middleware.
 *
 * Assigns every request an id (see {@link requestId}) and attaches `req.log`, a
 * child logger whose every entry carries `requestId`. When the response finishes
 * it logs one "request completed" line with method, URL, status and duration
 * (level `warn` for 4xx, `error` for 5xx). Liveness probes are not logged.
 *
 * @param logger - Root logger the per-request child loggers derive from.
 * @returns Express middleware; must be registered before the routes.
 */
export function requestLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: requestId,
    quietReqLogger: true,
    customAttributeKeys: { reqId: 'requestId' },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    autoLogging: { ignore: isLivenessProbe },
  });
}
