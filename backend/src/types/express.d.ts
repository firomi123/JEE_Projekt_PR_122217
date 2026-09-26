// Adds the authenticated user to Express' Request type (set by `requireAuth`;
// `role` is added by `requireRole`).
import type { UserRole } from '@driver-docs/shared';

declare global {
  namespace Express {
    interface Request {
      /**
       * Present on routes guarded by `requireAuth`: the verified token's subject;
       * `role` is loaded from the database by `requireRole`.
       */
      user?: { id: string; role?: UserRole };
    }
  }
}

export {};
