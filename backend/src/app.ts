import express, { type Express } from 'express';

/**
 * Creates and configures the Express application without starting an HTTP listener.
 *
 * Keeping construction separate from `listen()` lets functional tests drive the app
 * in-process through Supertest. The app currently only parses JSON request bodies;
 * routes, error handling and logging are added in Stage 3.
 *
 * @returns A configured Express application instance. Has no side effects beyond
 *   allocating the app object (no network, file or database access).
 */
export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  return app;
}
