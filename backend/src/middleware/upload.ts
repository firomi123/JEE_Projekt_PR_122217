import { MAX_UPLOAD_BYTES } from '@driver-docs/shared';
import type { Request, RequestHandler } from 'express';
import multer from 'multer';
import type { z } from 'zod';
import { ValidationError, type FieldIssue } from '../errors/app-error.js';
import { detectFileType } from '../lib/file-type.js';
import type { UploadedFile } from '../services/document.service.js';

/** Polish messages for upload problems, shown next to the file input. */
const FILE_MESSAGES = {
  missing: 'Dołącz plik dokumentu',
  tooLarge: `Plik jest za duży (maksymalnie ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`,
  badType: 'Dozwolone są tylko pliki JPG, PNG i PDF',
  tooMany: 'Wyślij dokładnie jeden plik w polu „file”',
};

/**
 * Creates the multipart parser for document uploads: exactly one file in the field
 * `file`, kept in memory, at most {@link MAX_UPLOAD_BYTES}; up to 10 short text fields.
 * Parser errors are turned into {@link ValidationError}s on the `file` field (400).
 *
 * @returns Express middleware that fills `req.file` and `req.body` (text fields).
 */
export function documentUpload(): RequestHandler {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10, fieldSize: 10 * 1024 },
  }).single('file');

  return (req, res, next) => {
    parse(req, res, (error: unknown) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        const message =
          error.code === 'LIMIT_FILE_SIZE'
            ? FILE_MESSAGES.tooLarge
            : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE'
              ? FILE_MESSAGES.tooMany
              : `Niepoprawne dane formularza (${error.code})`;
        return next(new ValidationError([{ path: 'file', message }], 'Invalid upload'));
      }
      next(error);
    });
  };
}

/**
 * Validates the text fields and the file of a parsed upload together, so the
 * client gets every problem in one response. The file format is detected from the
 * content (JPEG, PNG or PDF); the file name and declared type are ignored.
 *
 * @param req - Request after {@link documentUpload}.
 * @param schema - Zod schema of the text fields.
 * @returns The parsed fields and the file with its detected format.
 * @throws {ValidationError} 400 listing every invalid field, including `file`.
 */
export function readUpload<S extends z.ZodType>(
  req: Request,
  schema: S,
): { data: z.output<S>; file: UploadedFile } {
  const issues: FieldIssue[] = [];
  const fields = schema.safeParse(req.body ?? {});
  if (!fields.success) {
    issues.push(...ValidationError.fromZod(fields.error).issues);
  }

  let file: UploadedFile | undefined;
  if (!req.file) {
    issues.push({ path: 'file', message: FILE_MESSAGES.missing });
  } else {
    const mimeType = detectFileType(req.file.buffer);
    if (mimeType) file = { content: req.file.buffer, mimeType };
    else issues.push({ path: 'file', message: FILE_MESSAGES.badType });
  }

  if (issues.length > 0 || !fields.success || !file) throw new ValidationError(issues);
  return { data: fields.data, file };
}
