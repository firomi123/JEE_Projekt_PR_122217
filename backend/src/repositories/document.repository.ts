import type { ListDocumentsQuery } from '@driver-docs/shared';
import type {
  Document,
  DocumentHistory,
  DocumentVersion,
  HistoryAction,
  Prisma,
} from '../generated/prisma/client.js';
import type { PrismaClient } from '../lib/prisma.js';

/** Document row with its versions (newest first) and history (newest first). */
export type DocumentWithDetails = Document & {
  versions: DocumentVersion[];
  history: DocumentHistory[];
};

/** Document row with the MIME type of its current version (for the list). */
export type DocumentWithCurrentType = Document & { versions: Pick<DocumentVersion, 'mimeType'>[] };

/** Data of a stored file version, as produced by the service after encryption. */
export interface NewVersionRow {
  id: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  iv: Uint8Array<ArrayBuffer>;
  authTag: Uint8Array<ArrayBuffer>;
  encryptedDataKey: Uint8Array<ArrayBuffer>;
  changeNote: string | null;
}

/** One history entry to record. */
export interface HistoryEntry {
  action: HistoryAction;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}

/** Changes of a document's metadata. */
export type DocumentChanges = Partial<Pick<Document, 'title' | 'number' | 'status'>>;

/** Matches a UUID; other ids cannot exist, so they are answered as "not found" without a query. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Relations loaded for the details view. */
const DETAILS_INCLUDE = {
  versions: { orderBy: { versionNo: 'desc' } },
  history: { orderBy: [{ createdAt: 'desc' }, { field: 'asc' }] },
} satisfies Prisma.DocumentInclude;

/**
 * Data access for documents, their versions and history. Every read and write
 * is scoped by the owner and skips soft-deleted documents, so no query can reach
 * another user's or a deleted document.
 */
export class DocumentRepository {
  /** @param prisma - Database client. */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Finds an owner's (not deleted) document.
   *
   * @param id - Document id (any string; a malformed id finds nothing).
   * @param ownerId - Id of the requesting user.
   * @returns The document, or `null` if it does not exist, is deleted or belongs to someone else.
   */
  async findOwned(id: string, ownerId: string): Promise<Document | null> {
    if (!UUID_PATTERN.test(id)) return null;
    return this.prisma.document.findFirst({ where: { id, ownerId, deletedAt: null } });
  }

  /**
   * Like {@link findOwned}, with versions and history.
   *
   * @param id - Document id.
   * @param ownerId - Id of the requesting user.
   * @returns The document with details, or `null`.
   */
  async findOwnedWithDetails(id: string, ownerId: string): Promise<DocumentWithDetails | null> {
    if (!UUID_PATTERN.test(id)) return null;
    return this.prisma.document.findFirst({
      where: { id, ownerId, deletedAt: null },
      include: DETAILS_INCLUDE,
    });
  }

  /**
   * Finds one version of an owner's (not deleted) document.
   *
   * @param documentId - Document id.
   * @param ownerId - Id of the requesting user.
   * @param versionNo - Version number.
   * @returns The version row, or `null`.
   */
  async findOwnedVersion(
    documentId: string,
    ownerId: string,
    versionNo: number,
  ): Promise<{ version: DocumentVersion; document: Document } | null> {
    const document = await this.findOwned(documentId, ownerId);
    if (!document) return null;
    const version = await this.prisma.documentVersion.findUnique({
      where: { documentId_versionNo: { documentId, versionNo } },
    });
    return version ? { version, document } : null;
  }

  /**
   * Lists an owner's documents (not deleted), newest change first.
   *
   * @param ownerId - Id of the requesting user.
   * @param query - Filters (type, status, text in title/number) and paging.
   * @returns One page of documents with their current MIME type, and the total count.
   */
  async list(
    ownerId: string,
    query: ListDocumentsQuery,
  ): Promise<{ items: DocumentWithCurrentType[]; total: number }> {
    const where: Prisma.DocumentWhereInput = {
      ownerId,
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { number: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          versions: { select: { mimeType: true }, orderBy: { versionNo: 'desc' }, take: 1 },
        },
      }),
      this.prisma.document.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Creates a document with its first version and a CREATED history entry, in one
   * transaction.
   *
   * @param data - Document fields (explicit id, used in the storage key) and owner.
   * @param version - The stored first version.
   * @returns The created document with details.
   */
  async createWithFirstVersion(
    data: Pick<Document, 'id' | 'ownerId' | 'type' | 'title' | 'number'>,
    version: NewVersionRow,
  ): Promise<DocumentWithDetails> {
    return this.prisma.document.create({
      data: {
        ...data,
        currentVersion: 1,
        versions: { create: { ...version, versionNo: 1, createdById: data.ownerId } },
        history: { create: { action: 'CREATED', changedById: data.ownerId } },
      },
      include: DETAILS_INCLUDE,
    });
  }

  /**
   * Appends a version: atomically increments `currentVersion`, stores the version
   * under the new number and records VERSION_ADDED. Concurrent uploads get distinct
   * numbers because the increment happens in the database.
   *
   * @param documentId - Document id (ownership already checked by the caller).
   * @param userId - Uploading user.
   * @param version - The stored version.
   * @returns The updated document with details.
   */
  async addVersion(
    documentId: string,
    userId: string,
    version: NewVersionRow,
  ): Promise<DocumentWithDetails> {
    return this.prisma.$transaction(async (tx) => {
      const { currentVersion } = await tx.document.update({
        where: { id: documentId },
        data: { currentVersion: { increment: 1 } },
        select: { currentVersion: true },
      });
      await tx.documentVersion.create({
        data: { ...version, documentId, versionNo: currentVersion, createdById: userId },
      });
      await tx.documentHistory.create({
        data: {
          documentId,
          changedById: userId,
          action: 'VERSION_ADDED',
          field: 'version',
          oldValue: String(currentVersion - 1),
          newValue: String(currentVersion),
        },
      });
      return tx.document.findUniqueOrThrow({ where: { id: documentId }, include: DETAILS_INCLUDE });
    });
  }

  /**
   * Applies metadata changes and records the given history entries in one transaction.
   *
   * @param documentId - Document id (ownership already checked by the caller).
   * @param userId - User making the change.
   * @param changes - New values (only the fields that change).
   * @param entries - History entries describing the changes.
   * @returns The updated document with details.
   */
  async update(
    documentId: string,
    userId: string,
    changes: DocumentChanges,
    entries: HistoryEntry[],
  ): Promise<DocumentWithDetails> {
    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        ...changes,
        history: { create: entries.map((entry) => ({ ...entry, changedById: userId })) },
      },
      include: DETAILS_INCLUDE,
    });
  }

  /**
   * Marks a document as deleted (sets `deletedAt`) and records DELETED. The row,
   * versions, history and stored files are kept.
   *
   * @param documentId - Document id (ownership already checked by the caller).
   * @param userId - User deleting the document.
   */
  async softDelete(documentId: string, userId: string): Promise<void> {
    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        deletedAt: new Date(),
        history: { create: { action: 'DELETED', changedById: userId } },
      },
    });
  }
}
