import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { TooManyRequestsError } from '../errors/app-error.js';

/** Window over which failed login attempts are counted. */
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Creates the brute-force protection for `POST /api/auth/login`.
 *
 * Counts only failed attempts (responses with status ≥ 400) per client IP in a
 * 15-minute window; once `max` is reached, every further attempt from that IP gets
 * 429 `TOO_MANY_REQUESTS` with a `Retry-After` header until the window passes, even
 * with a correct password. Counters live in process memory (one API instance).
 * Behind nginx the client IP comes from `X-Forwarded-For` (see `TRUST_PROXY`).
 *
 * @param max - Failed attempts allowed per IP per window.
 * @returns Express middleware to put in front of the login handler.
 */
export function loginRateLimit(max: number): RequestHandler {
  return rateLimit({
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    limit: max,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, _res, next) => {
      req.log.warn('Login rate limit exceeded');
      next(new TooManyRequestsError('Too many failed login attempts, try again later'));
    },
  });
}
