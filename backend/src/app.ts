import express, { type Express } from 'express';
import { createHealthRouter } from './routes/health.js';

/**
 * Creates and configures the Express application without starting an HTTP listener.
 *
 * Keeping construction separate from `listen()` lets functional tests drive the app
 * in-process through Supertest. The app parses JSON request bodies and exposes the
 * liveness endpoint at `/health` (used by the Docker healthcheck) and `/api/health`
 * (the same endpoint reached through the frontend nginx proxy). Remaining routes,
 * error handling and logging are added in Stage 3.
 *
 * @returns A configured Express application instance. Has no side effects beyond
 *   allocating the app object (no network, file or database access).
 */
export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  const healthRouter = createHealthRouter();
  app.use('/health', healthRouter);
  app.use('/api/health', healthRouter);

  return app;
}
