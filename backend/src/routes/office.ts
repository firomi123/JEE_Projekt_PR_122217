import { reviewDocumentSchema } from '@driver-docs/shared';
import type { RequestHandler, Router } from 'express';
import { createRouter } from './router.js';
import type { OfficeController } from '../controllers/office.controller.js';
import { validateBody } from '../middleware/validate-body.js';

/**
 * Creates the router of the office (dispatcher) panel. Every route requires a valid
 * token of an office account; the office sees the documents of all drivers (never
 * deleted ones), can download their files and accept or reject submitted documents,
 * but cannot change or delete them otherwise:
 * - `GET /documents` – list with filters (status, type, text, driver) and paging,
 * - `GET /documents/:id` – details with versions, history and the driver,
 * - `GET /documents/:id/versions/:versionNo/file` – download a decrypted file,
 * - `POST /documents/:id/review` – accept or reject (with a reason),
 * - `GET /drivers` – drivers for the filter.
 *
 * @param controller - Office handlers.
 * @param guard - `requireAuth` followed by `requireRole(…, 'OFFICE')`.
 * @returns An Express router meant to be mounted at `/api/office`.
 */
export function createOfficeRouter(controller: OfficeController, guard: RequestHandler[]): Router {
  const router = createRouter();
  router.use(guard);
  router.get('/documents', controller.listDocuments);
  router.get('/documents/:id', controller.getDocument);
  router.get('/documents/:id/versions/:versionNo/file', controller.downloadFile);
  router.post('/documents/:id/review', validateBody(reviewDocumentSchema), controller.review);
  router.get('/drivers', controller.listDrivers);
  return router;
}
