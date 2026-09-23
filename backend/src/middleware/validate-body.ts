import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { ValidationError } from '../errors/app-error.js';

/**
 * Creates middleware that validates `req.body` against a Zod schema.
 *
 * On success replaces `req.body` with the parsed value (trimmed, lowercased, with
 * unknown fields removed, as the schema defines), so handlers only see clean data.
 *
 * @param schema - Zod schema of the expected body.
 * @returns Express middleware; on failure it throws a {@link ValidationError}
 *   (400 `VALIDATION_ERROR` with one entry per invalid field).
 */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) throw ValidationError.fromZod(result.error);
    req.body = result.data;
    next();
  };
}
