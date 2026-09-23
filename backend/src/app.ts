import type { S3Client } from '@aws-sdk/client-s3';
import express, { type Express } from 'express';
import type { Logger } from 'pino';
import type { Config } from './config/env.js';
import { AuthController } from './controllers/auth.controller.js';
import { HealthController } from './controllers/health.controller.js';
import type { PrismaClient } from './lib/prisma.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { loginRateLimit } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-logger.js';
import { requireAuth } from './middleware/require-auth.js';
import { HealthRepository } from './repositories/health.repository.js';
import { UserRepository } from './repositories/user.repository.js';
import { createAuthRouter } from './routes/auth.js';
import { createDocsRouter } from './routes/docs.js';
import { createHealthRouter } from './routes/health.js';
import { AuthService } from './services/auth.service.js';
import { HealthService } from './services/health.service.js';
import { TokenService } from './services/token.service.js';

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
 * Routes:
 * - `/health`, `/api/health` – liveness and readiness (the `/api` copy is what the
 *   frontend nginx forwards, since it proxies `/api/*` unchanged),
 * - `/api/auth` – registration, login (rate limited), current user,
 * - `/api/docs` – OpenAPI specification and Swagger UI.
 *
 * `trust proxy` is set to `config.trustProxy` hops, so behind nginx `req.ip` (used
 * by the login rate limit) is the real client address from `X-Forwarded-For`.
 *
 * @param deps - Configuration, logger and clients; no connection is opened here.
 * @returns The configured Express application.
 */
export function createApp(deps: AppDependencies): Express {
  const { config, logger, prisma, s3 } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(requestLogger(logger));
  app.use(express.json({ limit: '1mb' }));

  const tokens = new TokenService(config.jwt);
  const users = new UserRepository(prisma);

  const healthRouter = createHealthRouter(
    new HealthController(new HealthService(new HealthRepository(prisma, s3, config.s3.bucket))),
  );
  app.use('/health', healthRouter);
  app.use('/api/health', healthRouter);

  app.use(
    '/api/auth',
    createAuthRouter({
      controller: new AuthController(new AuthService(users, tokens)),
      authenticate: requireAuth(tokens),
      loginRateLimit: loginRateLimit(config.loginRateLimitMax),
    }),
  );

  app.use('/api/docs', createDocsRouter());

  app.use(notFound());
  app.use(errorHandler());
  return app;
}
