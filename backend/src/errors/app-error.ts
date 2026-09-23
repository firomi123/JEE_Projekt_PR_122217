import type { ZodError } from 'zod';

/** One problem with a request field, as returned in `error.details` of a 400 response. */
export interface FieldIssue {
  /** Dot-separated path of the offending field, e.g. `password` or `items.0.name`; empty for the whole body. */
  path: string;
  /** Human-readable description of the problem. */
  message: string;
}

/**
 * Base class of all errors that are meant to reach the client. The central error
 * handler turns it into `status` + `{ error: { code, message, details } }`.
 * Any other thrown value is treated as an unexpected 500 error.
 */
export class AppError extends Error {
  /**
   * @param status - HTTP status code sent to the client.
   * @param code - Stable, machine-readable error code (UPPER_SNAKE_CASE) the
   *   frontend uses to pick a Polish message.
   * @param message - Human-readable description (English, for developers).
   * @param details - Optional extra data, e.g. per-field validation issues.
   */
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400 – the request body, query or parameters failed validation. */
export class ValidationError extends AppError {
  /**
   * @param issues - Per-field problems, returned in `error.details`.
   * @param message - Overall description; defaults to a generic one.
   */
  constructor(
    readonly issues: FieldIssue[],
    message = 'Request validation failed',
  ) {
    super(400, 'VALIDATION_ERROR', message, issues);
  }

  /**
   * Converts a Zod validation error into a {@link ValidationError}.
   *
   * @param error - The error from a failed `schema.parse` / `safeParse`.
   * @returns A ValidationError with one {@link FieldIssue} per Zod issue.
   */
  static fromZod(error: ZodError): ValidationError {
    return new ValidationError(
      error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
}

/** 404 – the resource does not exist (or belongs to another user, see Stage 6). */
export class NotFoundError extends AppError {
  /** @param message - Description of what was not found. */
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

/**
 * 401 – the request is not authenticated: missing, invalid or expired token, or
 * wrong login credentials.
 */
export class UnauthorizedError extends AppError {
  /**
   * @param message - Description for developers.
   * @param code - `UNAUTHORIZED` (default), `TOKEN_EXPIRED` or `INVALID_CREDENTIALS`.
   */
  constructor(
    message = 'Authentication required',
    code: 'UNAUTHORIZED' | 'TOKEN_EXPIRED' | 'INVALID_CREDENTIALS' = 'UNAUTHORIZED',
  ) {
    super(401, code, message);
  }
}

/** 409 – the request conflicts with existing data (e.g. a taken username). */
export class ConflictError extends AppError {
  /**
   * @param issues - The conflicting fields, returned in `error.details` so a form can
   *   show the message next to the right input.
   * @param message - Overall description for developers.
   */
  constructor(issues: FieldIssue[], message = 'Resource already exists') {
    super(409, 'CONFLICT', message, issues);
  }
}

/** 429 – too many requests (rate limit exceeded). */
export class TooManyRequestsError extends AppError {
  /** @param message - Description for developers. */
  constructor(message = 'Too many requests, try again later') {
    super(429, 'TOO_MANY_REQUESTS', message);
  }
}

/** 403 – the user is authenticated but not allowed to perform the action. */
export class ForbiddenError extends AppError {
  /** @param message - Description of the refused action. */
  constructor(message = 'Access denied') {
    super(403, 'FORBIDDEN', message);
  }
}
