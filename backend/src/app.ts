import type { S3Client } from '@aws-sdk/client-s3';
import express, { type Express } from 'express';
import type { Logger } from 'pino';
import type { Config } from './config/env.js';
import { HealthController } from './controllers/health.controller.js';
import type { PrismaClient } from './lib/prisma.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requestLogger } from './middleware/request-logger.js';
import { HealthRepository } from './repositories/health.repository.js';
import { createHealthRouter } from './routes/health.js';
import { HealthService } from './services/health.service.js';

/** External resources the application is built from (created in `server.ts` or by tests). */
export interface AppDependencies {
  config: Config;
  logger: Logger;
  prisma: PrismaClient;
  s3: S3Client;
}

/**
 * Creates and configures the Express application without starting an HTTP listener.
 *
 * Keeping construction separate from `listen()` lets functional tests drive the app
 * in-process through Supertest with their own dependencies (e.g. a test database or
 * an unreachable one). Wires the layers `routes → controllers → services →
 * repositories` and registers, in order: request logging (request id), JSON body
 * parsing (limit 1 MB), routes, the 404 catch-all and the central error handler.
 *
 * Health endpoints are mounted at `/health` (Docker healthcheck) and at
 * `/api/health` (the same endpoints reached through the frontend nginx, which
 * forwards `/api/*` unchanged).
 *
 * @param deps - Configuration, logger and clients; no connection is opened here.
 * @returns The configured Express application.
 */
export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLogger(deps.logger));
  app.use(express.json({ limit: '1mb' }));

  const healthController = new HealthController(
    new HealthService(new HealthRepository(deps.prisma, deps.s3, deps.config.s3.bucket)),
  );
  const healthRouter = createHealthRouter(healthController);
  app.use('/health', healthRouter);
  app.use('/api/health', healthRouter);

  app.use(notFound());
  app.use(errorHandler());
  return app;
}
