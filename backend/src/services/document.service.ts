import { createHash, randomUUID } from 'node:crypto';
import {
  canTransition,
  DOCUMENT_STATUS_LABELS,
  type AllowedMimeType,
  type CreateDocumentData,
  type DocumentDetailsDto,
  type DocumentListResponse,
  type DocumentStatus,
  type DocumentSummaryDto,
  type ListDocumentsQuery,
  type NewVersionData,
  type UpdateDocumentData,
} from '@driver-docs/shared';
import type { Document } from '../generated/prisma/client.js';
import { AppError, NotFoundError } from '../errors/app-error.js';
import { EXTENSIONS } from '../lib/file-type.js';
import type {
  DocumentChanges,
  DocumentRepository,
  DocumentWithCurrentType,
  DocumentWithDetails,
  HistoryEntry,
  NewVersionRow,
} from '../repositories/document.repository.js';
import type { StorageRepository } from '../repositories/storage.repository.js';
import { DecryptionError, type EncryptionService } from './encryption.service.js';

/** An uploaded file whose format was already detected from its content. */
export interface UploadedFile {
  content: Buffer;
  mimeType: AllowedMimeType;
}

/** A decrypted file ready to be sent to the client. */
export interface DownloadedFile {
  content: Buffer;
  mimeType: AllowedMimeType;
  sha256: string;
  /** ASCII-only file name, e.g. `CMR_Lodz_Poznan-v1.pdf`. */
  asciiFilename: string;
  /** Original (UTF-8) file name, e.g. `CMR Łódź / Poznań-v1.pdf`. */
  utf8Filename: string;
}

/** Polish letters that Unicode normalization does not decompose into ASCII + accent. */
const SPECIAL_LETTERS: Record<string, string> = { ł: 'l', Ł: 'L' };

/**
 * Builds an ASCII-only file name stem from a document title.
 *
 * @param title - Document title, may contain Polish letters and punctuation.
 * @returns Title without diacritics; runs of other characters replaced by `_`;
 *   at most 80 characters; `dokument` if nothing remains.
 */
export function asciiFileStem(title: string): string {
  const stem = title
    .replace(/[\u0142\u0141]/g, (letter) => SPECIAL_LETTERS[letter]!)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return stem || 'dokument';
}

/**
 * SHA-256 of a buffer.
 *
 * @param data - Input bytes.
 * @returns Lowercase hex digest (64 characters).
 */
function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Error for any change attempted on an archived (read-only) document. */
function archivedError(): AppError {
  return new AppError(409, 'DOCUMENT_ARCHIVED', 'Archived documents are read-only', [
    { path: 'status', message: 'Dokument jest zarchiwizowany i nie można go zmieniać' },
  ]);
}

/**
 * Converts a document row to the list DTO.
 *
 * @param document - Row with its newest version's MIME type.
 * @returns The summary DTO.
 */
function toSummary(document: DocumentWithCurrentType | DocumentWithDetails): DocumentSummaryDto {
  return {
    id: document.id,
    type: document.type,
    status: document.status,
    title: document.title,
    number: document.number,
    currentVersion: document.currentVersion,
    mimeType: document.versions[0]!.mimeType as AllowedMimeType,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

/**
 * Converts a document row with details to the details DTO. Storage keys and
 * encryption parameters are deliberately left out.
 *
 * @param document - Row with versions and history (both newest first).
 * @returns The details DTO.
 */
export function toDetails(document: DocumentWithDetails): DocumentDetailsDto {
  return {
    ...toSummary(document),
    versions: document.versions.map((version) => ({
      versionNo: version.versionNo,
      mimeType: version.mimeType as AllowedMimeType,
      sizeBytes: version.sizeBytes,
      sha256: version.sha256,
      changeNote: version.changeNote,
      createdAt: version.createdAt.toISOString(),
    })),
    history: document.history.map((entry) => ({
      action: entry.action,
      field: entry.field,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

/**
 * Document logic: upload with envelope encryption, versioning, status rules,
 * change history, soft deletion and integrity-checked download. Every operation is
 * scoped to the requesting user; someone else's document behaves as if it did not
 * exist (404), so its existence is not revealed.
 */
export class DocumentService {
  /**
   * @param documents - Document data access.
   * @param storage - Object storage for the encrypted files.
   * @param encryption - Envelope encryption.
   */
  constructor(
    private readonly documents: DocumentRepository,
    private readonly storage: StorageRepository,
    private readonly encryption: EncryptionService,
  ) {}

  /**
   * Creates a document from an uploaded file (version 1, status DRAFT).
   *
   * @param ownerId - Uploading user.
   * @param data - Validated metadata.
   * @param file - Uploaded file with detected format.
   * @returns The created document with details.
   * Side effects: writes one encrypted object to MinIO and the document, version
   * and CREATED history rows to the database. If the database write fails, the
   * object is deleted again.
   */
  async create(
    ownerId: string,
    data: CreateDocumentData,
    file: UploadedFile,
  ): Promise<DocumentDetailsDto> {
    const documentId = randomUUID();
    const version = await this.storeEncrypted(ownerId, documentId, file, data.changeNote);
    const document = await this.rollbackOnFailure(version.storageKey, () =>
      this.documents.createWithFirstVersion(
        { id: documentId, ownerId, type: data.type, title: data.title, number: data.number },
        version,
      ),
    );
    return toDetails(document);
  }

  /**
   * Adds a new file version to an owned, non-archived document.
   *
   * @param ownerId - Requesting user.
   * @param documentId - Document id.
   * @param data - Validated version note.
   * @param file - Uploaded file with detected format.
   * @returns The updated document with details (`currentVersion` + 1).
   * @throws {NotFoundError} If the document is missing, deleted or not owned.
   * @throws {AppError} 409 `DOCUMENT_ARCHIVED` for an archived document.
   */
  async addVersion(
    ownerId: string,
    documentId: string,
    data: NewVersionData,
    file: UploadedFile,
  ): Promise<DocumentDetailsDto> {
    const document = await this.requireOwned(documentId, ownerId);
    if (document.status === 'ARCHIVED') throw archivedError();
    const version = await this.storeEncrypted(ownerId, documentId, file, data.changeNote);
    const updated = await this.rollbackOnFailure(version.storageKey, () =>
      this.documents.addVersion(documentId, ownerId, version),
    );
    return toDetails(updated);
  }

  /**
   * Lists the user's documents with filters and paging.
   *
   * @param ownerId - Requesting user.
   * @param query - Validated filters and paging.
   * @returns One page of summaries plus paging information.
   */
  async list(ownerId: string, query: ListDocumentsQuery): Promise<DocumentListResponse> {
    const { items, total } = await this.documents.list(ownerId, query);
    return {
      items: items.map(toSummary),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  /**
   * Returns one owned document with versions and history.
   *
   * @param ownerId - Requesting user.
   * @param documentId - Document id.
   * @returns The details DTO.
   * @throws {NotFoundError} If the document is missing, deleted or not owned.
   */
  async get(ownerId: string, documentId: string): Promise<DocumentDetailsDto> {
    const document = await this.documents.findOwnedWithDetails(documentId, ownerId);
    if (!document) throw new NotFoundError('Document not found');
    return toDetails(document);
  }

  /**
   * Changes title, number and/or status. Only fields whose value really changes
   * are written and recorded in the history (UPDATED per field, STATUS_CHANGED for
   * the status); a request without real changes writes nothing.
   *
   * @param ownerId - Requesting user.
   * @param documentId - Document id.
   * @param data - Validated changes (omitted fields stay as they are).
   * @returns The document with details after the change.
   * @throws {NotFoundError} If the document is missing, deleted or not owned.
   * @throws {AppError} 409 `DOCUMENT_ARCHIVED` for an archived document;
   *   409 `INVALID_STATUS_TRANSITION` if the status change is not allowed
   *   (nothing is changed in that case, not even the other fields).
   */
  async update(
    ownerId: string,
    documentId: string,
    data: UpdateDocumentData,
  ): Promise<DocumentDetailsDto> {
    const document = await this.requireOwned(documentId, ownerId);
    if (document.status === 'ARCHIVED') throw archivedError();

    const changes: DocumentChanges = {};
    const entries: HistoryEntry[] = [];
    if (data.status !== undefined && data.status !== document.status) {
      if (!canTransition(document.status, data.status)) {
        throw this.transitionError(document.status, data.status);
      }
      changes.status = data.status;
      entries.push({
        action: 'STATUS_CHANGED',
        field: 'status',
        oldValue: document.status,
        newValue: data.status,
      });
    }
    for (const field of ['title', 'number'] as const) {
      const value = data[field];
      if (value !== undefined && value !== document[field]) {
        changes[field] = value as string;
        entries.push({ action: 'UPDATED', field, oldValue: document[field], newValue: value });
      }
    }

    if (entries.length === 0) return this.get(ownerId, documentId);
    return toDetails(await this.documents.update(documentId, ownerId, changes, entries));
  }

  /**
   * Soft-deletes an owned document; it disappears from every endpoint but its rows
   * and encrypted files are kept (audit, possible restore).
   *
   * @param ownerId - Requesting user.
   * @param documentId - Document id.
   * @throws {NotFoundError} If the document is missing, already deleted or not owned.
   */
  async remove(ownerId: string, documentId: string): Promise<void> {
    await this.requireOwned(documentId, ownerId);
    await this.documents.softDelete(documentId, ownerId);
  }

  /**
   * Reads, decrypts and verifies one version's file.
   *
   * @param ownerId - Requesting user.
   * @param documentId - Document id.
   * @param versionParam - Version number from the URL (validated here).
   * @returns The original file with its type, checksum and download names.
   * @throws {NotFoundError} If the document or version does not exist for this user,
   *   or `versionParam` is not a positive integer.
   * @throws {AppError} 500 `FILE_INTEGRITY_ERROR` if the stored file fails GCM
   *   authentication or its SHA-256 differs from the recorded one (tampering or
   *   corruption); no content is returned in that case.
   */
  async getFile(
    ownerId: string,
    documentId: string,
    versionParam: string,
  ): Promise<DownloadedFile> {
    if (!/^[1-9]\d{0,8}$/.test(versionParam)) throw new NotFoundError('Version not found');
    const found = await this.documents.findOwnedVersion(documentId, ownerId, Number(versionParam));
    if (!found) throw new NotFoundError('Version not found');
    const { version, document } = found;

    const ciphertext = await this.storage.get(version.storageKey);
    let content: Buffer;
    try {
      content = this.encryption.decrypt(
        {
          ciphertext,
          iv: Buffer.from(version.iv),
          authTag: Buffer.from(version.authTag),
          encryptedDataKey: Buffer.from(version.encryptedDataKey),
        },
        version.storageKey,
      );
    } catch (error) {
      if (error instanceof DecryptionError) throw this.integrityError(version.storageKey);
      throw error;
    }
    if (sha256(content) !== version.sha256) throw this.integrityError(version.storageKey);

    const mimeType = version.mimeType as AllowedMimeType;
    const suffix = `-v${version.versionNo}.${EXTENSIONS[mimeType]}`;
    return {
      content,
      mimeType,
      sha256: version.sha256,
      asciiFilename: `${asciiFileStem(document.title)}${suffix}`,
      utf8Filename: `${document.title}${suffix}`,
    };
  }

  /**
   * Loads an owned, non-deleted document.
   *
   * @param documentId - Document id.
   * @param ownerId - Requesting user.
   * @returns The document row.
   * @throws {NotFoundError} If it does not exist for this user.
   */
  private async requireOwned(documentId: string, ownerId: string): Promise<Document> {
    const document = await this.documents.findOwned(documentId, ownerId);
    if (!document) throw new NotFoundError('Document not found');
    return document;
  }

  /**
   * Encrypts a file and uploads the ciphertext to MinIO under a new random key
   * `<ownerId>/<documentId>/<versionId>`; the key is also the encryption context.
   *
   * @param ownerId - Owner (key prefix).
   * @param documentId - Document the version belongs to.
   * @param file - Plaintext file with detected format.
   * @param changeNote - Optional note stored with the version.
   * @returns The version row to insert (without number and author).
   */
  private async storeEncrypted(
    ownerId: string,
    documentId: string,
    file: UploadedFile,
    changeNote: string | null,
  ): Promise<NewVersionRow> {
    const id = randomUUID();
    const storageKey = `${ownerId}/${documentId}/${id}`;
    const encrypted = this.encryption.encrypt(file.content, storageKey);
    await this.storage.put(storageKey, encrypted.ciphertext);
    return {
      id,
      storageKey,
      mimeType: file.mimeType,
      sizeBytes: file.content.length,
      sha256: sha256(file.content),
      // Prisma maps `Bytes` columns to Uint8Array backed by a plain ArrayBuffer.
      iv: new Uint8Array(encrypted.iv),
      authTag: new Uint8Array(encrypted.authTag),
      encryptedDataKey: new Uint8Array(encrypted.encryptedDataKey),
      changeNote,
    };
  }

  /**
   * Runs a database write; if it fails, deletes the already uploaded object so no
   * orphaned files remain, then rethrows.
   *
   * @param storageKey - Key of the object uploaded just before.
   * @param write - The database operation.
   * @returns The result of `write`.
   * @throws Whatever `write` throws (the cleanup error, if any, is ignored).
   */
  private async rollbackOnFailure<T>(storageKey: string, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Builds the 409 error for a forbidden status change, with a Polish field message.
   *
   * @param from - Current status.
   * @param to - Requested status.
   * @returns The error to throw.
   */
  private transitionError(from: DocumentStatus, to: DocumentStatus): AppError {
    return new AppError(409, 'INVALID_STATUS_TRANSITION', `Cannot change status ${from} → ${to}`, [
      {
        path: 'status',
        message: `Nie można zmienić statusu z „${DOCUMENT_STATUS_LABELS[from]}” na „${DOCUMENT_STATUS_LABELS[to]}”`,
      },
    ]);
  }

  /**
   * Builds the 500 error for a stored file that failed verification.
   *
   * @param storageKey - Key of the affected object (logged by the error handler).
   * @returns The error to throw.
   */
  private integrityError(storageKey: string): AppError {
    return new AppError(
      500,
      'FILE_INTEGRITY_ERROR',
      `Stored file failed the integrity check (${storageKey})`,
    );
  }
}
