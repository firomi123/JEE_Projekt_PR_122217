import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../errors/app-error.js';
import type { TokenService } from '../services/token.service.js';

/**
 * Creates middleware that only lets through requests with a valid access token.
 *
 * Expects `Authorization: Bearer <jwt>`. On success sets `req.user = { id }` (the
 * token's `sub`) and continues. It does not query the database; handlers that need
 * the account load it and treat a missing account as 401.
 *
 * @param tokens - Verifies the token.
 * @returns Express middleware; on failure it forwards {@link UnauthorizedError}
 *   (`UNAUTHORIZED`, or `TOKEN_EXPIRED` for an expired token) to the error handler.
 */
export function requireAuth(tokens: TokenService): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer (\S+)$/.exec(header);
    if (!match?.[1]) {
      throw new UnauthorizedError('Missing Bearer access token');
    }
    req.user = { id: await tokens.verify(match[1]) };
    next();
  };
}
