// Adds the authenticated user to Express' Request type (set by `requireAuth`).

declare global {
  namespace Express {
    interface Request {
      /** Present on routes guarded by `requireAuth`: the verified token's subject. */
      user?: { id: string };
    }
  }
}

export {};
