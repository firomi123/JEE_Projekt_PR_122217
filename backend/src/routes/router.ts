import { Router } from 'express';

/**
 * Creates an Express router that remembers its mount path in
 * `res.locals.mountPath`.
 *
 * Express restores `req.baseUrl` when a request leaves a router, so by the time the
 * response finishes (when metrics are recorded) the mount path of the matched route
 * is lost. Keeping it lets the metrics label requests with the full route template,
 * e.g. `/api/documents/:id`.
 *
 * @returns A new router; use it like `Router()`.
 */
export function createRouter(): Router {
  const router = Router();
  router.use((req, res, next) => {
    res.locals.mountPath = req.baseUrl;
    next();
  });
  return router;
}
