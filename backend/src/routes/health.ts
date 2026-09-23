import { Router } from 'express';

/**
 * Creates the router with the liveness endpoint.
 *
 * `GET /` responds `200 { "status": "ok" }` as long as the process can serve HTTP.
 * It deliberately checks no dependencies, so a database outage does not make Docker
 * restart a healthy API process. The readiness check (`/ready`, PostgreSQL and MinIO)
 * is added in Stage 3.
 *
 * @returns An Express router meant to be mounted at `/health` and `/api/health`.
 *   Has no side effects.
 */
export function createHealthRouter(): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({ status: 'ok' });
  });
  return router;
}
