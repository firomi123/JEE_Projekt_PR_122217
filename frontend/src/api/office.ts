import type {
  DriverListResponse,
  OfficeDocumentListResponse,
  OfficeDocumentResponse,
  ReviewDocumentInput,
} from '@driver-docs/shared';
import { apiFetch, apiRequest } from './client';
import { documentsQuery, type DocumentFilters } from './documents';

/** Filters of the office list: those of the driver's list plus a driver. */
export interface OfficeDocumentFilters extends DocumentFilters {
  driverId?: string;
}

/**
 * `GET /api/office/documents` – one page of the documents of all drivers.
 *
 * @param filters - Type, status, text search, driver and paging.
 * @returns The page with the drivers and paging information.
 * @throws {ApiError} 403 for an account that is not an office account.
 */
export function listOfficeDocuments(
  filters: OfficeDocumentFilters,
): Promise<OfficeDocumentListResponse> {
  return apiRequest<OfficeDocumentListResponse>(`/api/office/documents${documentsQuery(filters)}`);
}

/**
 * `GET /api/office/documents/:id` – document with versions, history and driver.
 *
 * @param id - Document id.
 * @returns The document.
 * @throws {ApiError} 404 if it does not exist or was deleted.
 */
export function getOfficeDocument(id: string): Promise<OfficeDocumentResponse> {
  return apiRequest<OfficeDocumentResponse>(`/api/office/documents/${encodeURIComponent(id)}`);
}

/**
 * Downloads a decrypted version file of any driver's document as a Blob (see
 * `fetchVersionFile` for why a Blob is needed).
 *
 * @param id - Document id.
 * @param versionNo - Version number.
 * @returns The file content with its MIME type.
 */
export async function fetchOfficeVersionFile(id: string, versionNo: number): Promise<Blob> {
  const response = await apiFetch(
    `/api/office/documents/${encodeURIComponent(id)}/versions/${versionNo}/file`,
  );
  return response.blob();
}

/**
 * `POST /api/office/documents/:id/review` – accepts or rejects a submitted document.
 *
 * @param id - Document id.
 * @param review - Decision and comment (required when rejecting).
 * @returns The document after the decision.
 * @throws {ApiError} 400 without a reason for a rejection; 409 if the document is not
 *   submitted (anymore).
 */
export function reviewDocument(
  id: string,
  review: ReviewDocumentInput,
): Promise<OfficeDocumentResponse> {
  return apiRequest<OfficeDocumentResponse>(
    `/api/office/documents/${encodeURIComponent(id)}/review`,
    { method: 'POST', json: review },
  );
}

/** `GET /api/office/drivers`. @returns All drivers with their contact data. */
export function listDrivers(): Promise<DriverListResponse> {
  return apiRequest<DriverListResponse>('/api/office/drivers');
}
