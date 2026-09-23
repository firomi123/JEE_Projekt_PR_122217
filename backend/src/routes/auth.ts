import { loginSchema, registerSchema } from '@driver-docs/shared';
import type { Router, RequestHandler } from 'express';
import { createRouter } from './router.js';
import type { AuthController } from '../controllers/auth.controller.js';
import { validateBody } from '../middleware/validate-body.js';

/** Middleware the auth router needs from the application. */
export interface AuthRouterDeps {
  controller: AuthController;
  /** Verifies the access token (`requireAuth`). */
  authenticate: RequestHandler;
  /** Brute-force protection of the login endpoint. */
  loginRateLimit: RequestHandler;
}

/**
 * Creates the router of the authentication endpoints:
 * - `POST /register` – body validated with the shared `registerSchema`,
 * - `POST /login` – rate limited, body validated with `loginSchema`,
 * - `GET /me` – requires a valid access token.
 *
 * @param deps - Controller and middleware.
 * @returns An Express router meant to be mounted at `/api/auth`.
 */
export function createAuthRouter(deps: AuthRouterDeps): Router {
  const router = createRouter();
  router.post('/register', validateBody(registerSchema), deps.controller.register);
  router.post('/login', deps.loginRateLimit, validateBody(loginSchema), deps.controller.login);
  router.get('/me', deps.authenticate, deps.controller.me);
  return router;
}
