import { profileSchema } from '@driver-docs/shared';
import { Router, type RequestHandler } from 'express';
import type { ProfileController } from '../controllers/profile.controller.js';
import { validateBody } from '../middleware/validate-body.js';

/**
 * Creates the router of the driver profile (always the caller's own profile, so no
 * id appears in the URL and another user's profile cannot be addressed at all):
 * - `GET /` – read the profile,
 * - `PUT /` – replace the profile, body validated with the shared `profileSchema`.
 *
 * @param controller - Profile handlers.
 * @param authenticate - `requireAuth` middleware, applied to every route.
 * @returns An Express router meant to be mounted at `/api/profile`.
 */
export function createProfileRouter(
  controller: ProfileController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/', controller.get);
  router.put('/', validateBody(profileSchema), controller.update);
  return router;
}
