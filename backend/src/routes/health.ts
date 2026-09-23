import { Router } from 'express';
import type { HealthController } from '../controllers/health.controller.js';

/**
 * Creates the router of the health endpoints:
 * - `GET /` – liveness (process is up),
 * - `GET /ready` – readiness (PostgreSQL and MinIO reachable).
 *
 * @param controller - Handlers for both endpoints.
 * @returns An Express router meant to be mounted at `/health` and `/api/health`.
 */
export function createHealthRouter(controller: HealthController): Router {
  const router = Router();
  router.get('/', controller.liveness);
  router.get('/ready', controller.readiness);
  return router;
}
