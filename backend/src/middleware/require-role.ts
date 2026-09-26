import type { UserRole } from '@driver-docs/shared';
import type { RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors/app-error.js';
import type { UserRepository } from '../repositories/user.repository.js';

/**
 * Creates middleware that lets through only users with the given role. Must run
 * after `requireAuth`. The role is read from the database on every request (not
 * from the token), so a changed role or a deleted account takes effect at once.
 *
 * @param users - User data access.
 * @param role - The only role allowed on the guarded routes.
 * @returns Express middleware; sets `req.user.role` and continues, or forwards
 *   {@link UnauthorizedError} (401, the account no longer exists) or
 *   {@link ForbiddenError} (403 `FORBIDDEN`, another role) to the error handler.
 */
export function requireRole(users: UserRepository, role: UserRole): RequestHandler {
  return async (req, _res, next) => {
    const user = req.user ? await users.findById(req.user.id) : null;
    if (!user) throw new UnauthorizedError('User no longer exists');
    if (user.role !== role)
      throw new ForbiddenError('This endpoint is not available for your role');
    req.user = { id: user.id, role: user.role };
    next();
  };
}
