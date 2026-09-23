import type {
  DocumentListResponse,
  DocumentResponse,
  DocumentStatus,
  DocumentType,
  ProfileInput,
  ProfileResponse,
  UpdateDocumentInput,
} from '@driver-docs/shared';
import { apiFetch, apiRequest } from './client';

/** Filters and paging of the document list (all optional). */
export interface DocumentFilters {
  type?: DocumentType;
  status?: DocumentStatus;
  q?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Builds the query string of the document list, skipping empty filters.
 *
 * @param filters - Filters and paging.
 * @returns `?type=…&status=…` or an empty string.
 */
export function documentsQuery(filters: DocumentFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * `GET /api/documents` – one page of the user's documents.
 *
 * @param filters - Type, status, text search and paging.
 * @returns The page with paging information.
 */
export function listDocuments(filters: DocumentFilters): Promise<DocumentListResponse> {
  return apiRequest<DocumentListResponse>(`/api/documents${documentsQuery(filters)}`);
}

/**
 * `GET /api/documents/:id` – document with versions and history.
 *
 * @param id - Document id.
 * @returns The document.
 * @throws {ApiError} 404 if it does not exist (or is not the user's).
 */
export function getDocument(id: string): Promise<DocumentResponse> {
  return apiRequest<DocumentResponse>(`/api/documents/${encodeURIComponent(id)}`);
}

/** Fields of a new document; the file is sent as multipart `file`. */
export interface NewDocument {
  type: DocumentType;
  title: string;
  number?: string;
  changeNote?: string;
  file: Blob;
  /** File name sent to the server (only informative; the server detects the format). */
  fileName: string;
}

/**
 * `POST /api/documents` – uploads a file as a new document.
 *
 * @param data - Metadata and file.
 * @returns The created document.
 * @throws {ApiError} 400 with field details (including `file`).
 */
export function createDocument(data: NewDocument): Promise<DocumentResponse> {
  const form = new FormData();
  form.set('type', data.type);
  form.set('title', data.title);
  if (data.number) form.set('number', data.number);
  if (data.changeNote) form.set('changeNote', data.changeNote);
  form.set('file', data.file, data.fileName);
  return apiRequest<DocumentResponse>('/api/documents', { method: 'POST', formData: form });
}

/**
 * `POST /api/documents/:id/versions` – uploads a new version of the file.
 *
 * @param id - Document id.
 * @param file - New file.
 * @param fileName - File name sent to the server.
 * @param changeNote - Optional description of the version.
 * @returns The document with the new current version.
 */
export function addVersion(
  id: string,
  file: Blob,
  fileName: string,
  changeNote?: string,
): Promise<DocumentResponse> {
  const form = new FormData();
  if (changeNote) form.set('changeNote', changeNote);
  form.set('file', file, fileName);
  return apiRequest<DocumentResponse>(`/api/documents/${encodeURIComponent(id)}/versions`, {
    method: 'POST',
    formData: form,
  });
}

/**
 * `PATCH /api/documents/:id` – changes title, number and/or status.
 *
 * @param id - Document id.
 * @param changes - Fields to change.
 * @returns The document after the change.
 * @throws {ApiError} 409 `INVALID_STATUS_TRANSITION` / `DOCUMENT_ARCHIVED`.
 */
export function updateDocument(
  id: string,
  changes: UpdateDocumentInput,
): Promise<DocumentResponse> {
  return apiRequest<DocumentResponse>(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: changes,
  });
}

/**
 * `DELETE /api/documents/:id` – soft-deletes a document.
 *
 * @param id - Document id.
 */
export async function deleteDocument(id: string): Promise<void> {
  await apiRequest<void>(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * Downloads a decrypted version file as a Blob. The file endpoint needs the
 * Authorization header, so it cannot be used directly in `<img src>`; callers
 * turn the Blob into an object URL.
 *
 * @param id - Document id.
 * @param versionNo - Version number.
 * @returns The file content with its MIME type.
 */
export async function fetchVersionFile(id: string, versionNo: number): Promise<Blob> {
  const response = await apiFetch(
    `/api/documents/${encodeURIComponent(id)}/versions/${versionNo}/file`,
  );
  return response.blob();
}

/** `GET /api/profile`. @returns The driver profile. */
export function getProfile(): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>('/api/profile');
}

/**
 * `PUT /api/profile` – replaces the driver profile.
 *
 * @param data - All profile fields (blank = cleared).
 * @returns The saved profile.
 */
export function saveProfile(data: ProfileInput): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>('/api/profile', { method: 'PUT', json: data });
}
