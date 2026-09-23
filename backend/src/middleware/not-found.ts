import type { RequestHandler } from 'express';
import { NotFoundError } from '../errors/app-error.js';

/**
 * Catch-all middleware registered after every route: any request that reaches it
 * matched no route.
 *
 * @returns Middleware that forwards a {@link NotFoundError} naming the method and
 *   path to the error handler (it never sends a response itself).
 */
export function notFound(): RequestHandler {
  return (req, _res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
  };
}
