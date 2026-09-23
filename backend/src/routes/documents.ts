import { updateDocumentSchema } from '@driver-docs/shared';
import { Router, type RequestHandler } from 'express';
import type { DocumentController } from '../controllers/document.controller.js';
import { validateBody } from '../middleware/validate-body.js';
import { documentUpload } from '../middleware/upload.js';

/**
 * Creates the router of the documents API (every route requires a valid token and
 * only ever sees the caller's own, non-deleted documents):
 * - `GET /` – list with filters and paging,
 * - `POST /` – upload a new document (multipart),
 * - `GET /:id` – details with versions and history,
 * - `PATCH /:id` – change title, number, status,
 * - `DELETE /:id` – soft delete,
 * - `POST /:id/versions` – upload a new version (multipart),
 * - `GET /:id/versions/:versionNo/file` – download a decrypted file.
 *
 * @param controller - Document handlers.
 * @param authenticate - `requireAuth` middleware; runs before the (memory-hungry)
 *   multipart parser, so anonymous uploads are rejected before any file is read.
 * @returns An Express router meant to be mounted at `/api/documents`.
 */
export function createDocumentsRouter(
  controller: DocumentController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/', controller.list);
  router.post('/', documentUpload(), controller.create);
  router.get('/:id', controller.get);
  router.patch('/:id', validateBody(updateDocumentSchema), controller.update);
  router.delete('/:id', controller.remove);
  router.post('/:id/versions', documentUpload(), controller.addVersion);
  router.get('/:id/versions/:versionNo/file', controller.downloadFile);
  return router;
}
