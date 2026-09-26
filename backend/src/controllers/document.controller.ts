import {
  createDocumentSchema,
  listDocumentsQuerySchema,
  newVersionSchema,
  type DocumentListResponse,
  type DocumentResponse,
  type UpdateDocumentData,
} from '@driver-docs/shared';
import type { Request, Response } from 'express';
import { ValidationError } from '../errors/app-error.js';
import type { Metrics } from '../lib/metrics.js';
import { readUpload } from '../middleware/upload.js';
import type { DocumentService, DownloadedFile } from '../services/document.service.js';

/**
 * Reads a route parameter as a string.
 *
 * @param req - Request.
 * @param name - Parameter name.
 * @returns The parameter value (empty string if absent).
 */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  return typeof value === 'string' ? value : '';
}

/**
 * Sends a decrypted document file. Shown inline by default (preview), as an
 * attachment with `?download=1`. The response must not be cached
 * (`private, no-store`) because documents are confidential; the ETag is the SHA-256.
 *
 * @param req - Request (reads `download` from the query string).
 * @param res - Receives the bytes with Content-Type, Content-Disposition (ASCII
 *   `filename` plus UTF-8 `filename*`), Content-Length, ETag and `nosniff`.
 * @param file - Decrypted and verified file.
 */
export function sendFile(req: Request, res: Response, file: DownloadedFile): void {
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.set({
    'Content-Type': file.mimeType,
    'Content-Length': String(file.content.length),
    'Content-Disposition': `${disposition}; filename="${file.asciiFilename}"; filename*=UTF-8''${encodeURIComponent(file.utf8Filename)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ETag: `"${file.sha256}"`,
  });
  res.end(file.content);
}

/** HTTP handlers of `/api/documents`. All routes require authentication. */
export class DocumentController {
  /**
   * @param service - Document logic.
   * @param metrics - Application metrics (upload counter and size).
   */
  constructor(
    private readonly service: DocumentService,
    private readonly metrics: Metrics,
  ) {}

  /**
   * `POST /api/documents` (multipart: `file`, `type`, `title`, `number?`, `changeNote?`)
   * – responds `201 { document }`.
   *
   * @param req - Authenticated request parsed by `documentUpload`.
   * @param res - Receives the created document.
   */
  create = async (req: Request, res: Response): Promise<void> => {
    const { data, file } = readUpload(req, createDocumentSchema);
    const document = await this.service.create(req.user!.id, data, file);
    this.metrics.uploads.inc({ type: document.type });
    this.metrics.uploadSize.observe(file.content.length);
    req.log.info(
      { documentId: document.id, mimeType: file.mimeType, sizeBytes: file.content.length },
      'Document uploaded',
    );
    const body: DocumentResponse = { document };
    res.status(201).json(body);
  };

  /**
   * `POST /api/documents/:id/versions` (multipart: `file`, `changeNote?`)
   * – responds `201 { document }` with the new current version.
   *
   * @param req - Authenticated request parsed by `documentUpload`.
   * @param res - Receives the updated document.
   */
  addVersion = async (req: Request, res: Response): Promise<void> => {
    const { data, file } = readUpload(req, newVersionSchema);
    const document = await this.service.addVersion(req.user!.id, param(req, 'id'), data, file);
    this.metrics.uploads.inc({ type: document.type });
    this.metrics.uploadSize.observe(file.content.length);
    req.log.info(
      { documentId: document.id, versionNo: document.currentVersion },
      'Document version added',
    );
    const body: DocumentResponse = { document };
    res.status(201).json(body);
  };

  /**
   * `GET /api/documents?type=&status=&q=&page=&pageSize=` – responds `200` with one page.
   *
   * @param req - Authenticated request; the query string is validated here.
   * @param res - Receives the page.
   * @throws {ValidationError} 400 for invalid filters or paging.
   */
  list = async (req: Request, res: Response): Promise<void> => {
    const query = listDocumentsQuerySchema.safeParse(req.query);
    if (!query.success) throw ValidationError.fromZod(query.error);
    const body: DocumentListResponse = await this.service.list(req.user!.id, query.data);
    res.json(body);
  };

  /**
   * `GET /api/documents/:id` – responds `200 { document }` with versions and history.
   *
   * @param req - Authenticated request.
   * @param res - Receives the document.
   */
  get = async (req: Request, res: Response): Promise<void> => {
    const body: DocumentResponse = {
      document: await this.service.get(req.user!.id, param(req, 'id')),
    };
    res.json(body);
  };

  /**
   * `PATCH /api/documents/:id` – responds `200 { document }` after the change.
   *
   * @param req - Authenticated request; body validated as {@link UpdateDocumentData}.
   * @param res - Receives the updated document.
   */
  update = async (req: Request, res: Response): Promise<void> => {
    const document = await this.service.update(
      req.user!.id,
      param(req, 'id'),
      req.body as UpdateDocumentData,
    );
    req.log.info({ documentId: document.id, status: document.status }, 'Document updated');
    const body: DocumentResponse = { document };
    res.json(body);
  };

  /**
   * `DELETE /api/documents/:id` – soft delete, responds `204` without a body.
   *
   * @param req - Authenticated request.
   * @param res - Receives the empty response.
   */
  remove = async (req: Request, res: Response): Promise<void> => {
    await this.service.remove(req.user!.id, param(req, 'id'));
    req.log.info({ documentId: param(req, 'id') }, 'Document deleted');
    res.status(204).end();
  };

  /**
   * `GET /api/documents/:id/versions/:versionNo/file[?download=1]` – sends the
   * decrypted file. Shown inline by default (preview), as an attachment with
   * `download=1`. The response must not be cached (`private, no-store`) because
   * documents are confidential; the ETag is the file's SHA-256.
   *
   * @param req - Authenticated request.
   * @param res - Receives the file bytes with Content-Type, Content-Disposition
   *   (ASCII `filename` plus UTF-8 `filename*`), Content-Length and ETag.
   */
  downloadFile = async (req: Request, res: Response): Promise<void> => {
    const file = await this.service.getFile(
      req.user!.id,
      param(req, 'id'),
      param(req, 'versionNo'),
    );
    sendFile(req, res, file);
  };
}
