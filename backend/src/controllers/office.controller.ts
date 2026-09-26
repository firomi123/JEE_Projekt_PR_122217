import {
  officeListQuerySchema,
  type DriverListResponse,
  type OfficeDocumentListResponse,
  type OfficeDocumentResponse,
  type ReviewDocumentData,
} from '@driver-docs/shared';
import type { Request, Response } from 'express';
import { ValidationError } from '../errors/app-error.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { toDriverDto, type DocumentService } from '../services/document.service.js';
import { param, sendFile } from './document.controller.js';

/** HTTP handlers of `/api/office` (office accounts only; see `requireRole`). */
export class OfficeController {
  /**
   * @param documents - Document logic (office operations).
   * @param users - User data access (list of drivers).
   */
  constructor(
    private readonly documents: DocumentService,
    private readonly users: UserRepository,
  ) {}

  /**
   * `GET /api/office/documents?status&type&q&driverId&page&pageSize` – responds
   * `200` with one page of the documents of all drivers (with their drivers).
   *
   * @param req - Office request; the query string is validated here.
   * @param res - Receives the page.
   * @throws {ValidationError} 400 for invalid filters (e.g. a driver id that is not a UUID).
   */
  listDocuments = async (req: Request, res: Response): Promise<void> => {
    const query = officeListQuerySchema.safeParse(req.query);
    if (!query.success) throw ValidationError.fromZod(query.error);
    const body: OfficeDocumentListResponse = await this.documents.listForOffice(query.data);
    res.json(body);
  };

  /**
   * `GET /api/office/documents/:id` – responds `200 { document }` with versions,
   * history and the driver.
   *
   * @param req - Office request.
   * @param res - Receives the document.
   */
  getDocument = async (req: Request, res: Response): Promise<void> => {
    const body: OfficeDocumentResponse = {
      document: await this.documents.getForOffice(param(req, 'id')),
    };
    res.json(body);
  };

  /**
   * `GET /api/office/documents/:id/versions/:versionNo/file[?download=1]` – sends the
   * decrypted file like the driver endpoint does.
   *
   * @param req - Office request.
   * @param res - Receives the file.
   */
  downloadFile = async (req: Request, res: Response): Promise<void> => {
    const file = await this.documents.getFileForOffice(param(req, 'id'), param(req, 'versionNo'));
    sendFile(req, res, file);
  };

  /**
   * `POST /api/office/documents/:id/review` – accepts or rejects a submitted document;
   * responds `200 { document }` after the decision.
   *
   * @param req - Office request; body validated as {@link ReviewDocumentData}.
   * @param res - Receives the reviewed document.
   */
  review = async (req: Request, res: Response): Promise<void> => {
    const data = req.body as ReviewDocumentData;
    const document = await this.documents.review(req.user!.id, param(req, 'id'), data);
    req.log.info({ documentId: document.id, decision: data.decision }, 'Document reviewed');
    const body: OfficeDocumentResponse = { document };
    res.json(body);
  };

  /**
   * `GET /api/office/drivers` – responds `200 { drivers }` (driver accounts with the
   * contact data of their profiles, by username), e.g. for the driver filter.
   *
   * @param _req - Office request.
   * @param res - Receives the drivers.
   */
  listDrivers = async (_req: Request, res: Response): Promise<void> => {
    const body: DriverListResponse = {
      drivers: (await this.users.listDrivers()).map(toDriverDto),
    };
    res.json(body);
  };
}
