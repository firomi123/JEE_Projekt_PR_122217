import { z } from 'zod';

/** Kinds of transport documents a driver keeps. */
export const DOCUMENT_TYPES = ['CMR', 'WZ', 'INVOICE', 'OTHER'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Polish labels of the document types, shown in the UI. */
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CMR: 'List przewozowy CMR',
  WZ: 'Wydanie zewnętrzne (WZ)',
  INVOICE: 'Faktura',
  OTHER: 'Inny dokument',
};

/** Lifecycle statuses of a document. */
export const DOCUMENT_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'ACCEPTED',
  'REJECTED',
  'ARCHIVED',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Polish labels of the statuses, shown in the UI. */
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: 'Roboczy',
  SUBMITTED: 'Przesłany',
  ACCEPTED: 'Zaakceptowany',
  REJECTED: 'Odrzucony',
  ARCHIVED: 'Zarchiwizowany',
};

/**
 * Allowed status changes. A document starts as DRAFT, is SUBMITTED to the office,
 * which ACCEPTS or REJECTS it; a rejected document can be corrected (back to DRAFT)
 * or resubmitted; a submitted one can be withdrawn. ARCHIVED is final: an archived
 * document is read-only.
 */
export const STATUS_TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> = {
  DRAFT: ['SUBMITTED', 'ARCHIVED'],
  SUBMITTED: ['ACCEPTED', 'REJECTED', 'DRAFT'],
  REJECTED: ['DRAFT', 'SUBMITTED', 'ARCHIVED'],
  ACCEPTED: ['ARCHIVED'],
  ARCHIVED: [],
};

/**
 * Tells whether a document may move from one status to another.
 *
 * @param from - Current status.
 * @param to - Requested status.
 * @returns `true` if {@link STATUS_TRANSITIONS} allows it; `false` otherwise,
 *   including `from === to` (not a change).
 */
export function canTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

/** Maximum size of an uploaded file (10 MiB). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** File formats accepted for documents, detected from the file content. */
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Length limits, equal to the database column sizes. */
export const DOCUMENT_LIMITS = { title: 200, number: 50, changeNote: 500 } as const;

/** Document title: trimmed, 1–200 characters. */
const titleSchema = z
  .string({ error: 'Podaj tytuł dokumentu' })
  .trim()
  .min(1, 'Podaj tytuł dokumentu')
  .max(DOCUMENT_LIMITS.title, `Tytuł może mieć najwyżej ${DOCUMENT_LIMITS.title} znaków`);

/** Document number (e.g. CMR number): optional, trimmed, blank → `null`. */
const numberSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => (value == null || value.trim() === '' ? null : value.trim()))
  .pipe(
    z
      .string()
      .max(DOCUMENT_LIMITS.number, `Numer może mieć najwyżej ${DOCUMENT_LIMITS.number} znaków`)
      .nullable(),
  );

/** Note describing a version (e.g. "skan z pieczątką odbiorcy"): optional, blank → `null`. */
const changeNoteSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => (value == null || value.trim() === '' ? null : value.trim()))
  .pipe(
    z
      .string()
      .max(
        DOCUMENT_LIMITS.changeNote,
        `Opis zmiany może mieć najwyżej ${DOCUMENT_LIMITS.changeNote} znaków`,
      )
      .nullable(),
  );

/** Text fields of `POST /api/documents` (multipart; the file is sent as `file`). */
export const createDocumentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES, { error: 'Wybierz typ dokumentu' }),
  title: titleSchema,
  number: numberSchema,
  changeNote: changeNoteSchema,
});

/** Text fields of `POST /api/documents/:id/versions` (multipart; file as `file`). */
export const newVersionSchema = z.object({ changeNote: changeNoteSchema });

/**
 * Body of `PATCH /api/documents/:id`: any subset of title, number and status, but
 * at least one of them. An omitted field is left unchanged; `number: null` clears it.
 */
export const updateDocumentSchema = z
  .object({
    title: titleSchema.optional(),
    number: z
      .union([z.string(), z.null()])
      .transform((value) => (value == null || value.trim() === '' ? null : value.trim()))
      .pipe(
        z
          .string()
          .max(DOCUMENT_LIMITS.number, `Numer może mieć najwyżej ${DOCUMENT_LIMITS.number} znaków`)
          .nullable(),
      )
      .optional(),
    status: z.enum(DOCUMENT_STATUSES, { error: 'Nieznany status' }).optional(),
  })
  .refine(
    (data) => data.title !== undefined || data.number !== undefined || data.status !== undefined,
    { message: 'Podaj co najmniej jedno pole do zmiany: title, number lub status' },
  );

/** Query string of `GET /api/documents`. */
export const listDocumentsQuerySchema = z.object({
  type: z.enum(DOCUMENT_TYPES, { error: 'Nieznany typ dokumentu' }).optional(),
  status: z.enum(DOCUMENT_STATUSES, { error: 'Nieznany status' }).optional(),
  /** Case-insensitive search in title and number. */
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateDocumentData = z.output<typeof createDocumentSchema>;
export type NewVersionData = z.output<typeof newVersionSchema>;
export type UpdateDocumentInput = z.input<typeof updateDocumentSchema>;
export type UpdateDocumentData = z.output<typeof updateDocumentSchema>;
export type ListDocumentsQuery = z.output<typeof listDocumentsQuerySchema>;

/** One stored file version of a document (no storage or encryption details). */
export interface DocumentVersionDto {
  versionNo: number;
  mimeType: AllowedMimeType;
  sizeBytes: number;
  /** Hex SHA-256 of the original (decrypted) file. */
  sha256: string;
  changeNote: string | null;
  createdAt: string;
}

/** Kinds of entries in a document's change history. */
export const HISTORY_ACTIONS = [
  'CREATED',
  'UPDATED',
  'STATUS_CHANGED',
  'VERSION_ADDED',
  'DELETED',
] as const;
export type HistoryAction = (typeof HISTORY_ACTIONS)[number];

/** One entry of a document's change history. */
export interface DocumentHistoryDto {
  action: HistoryAction;
  /** Changed field for UPDATED (`title`, `number`); `status` for STATUS_CHANGED; else `null`. */
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

/** Document as shown in the list. */
export interface DocumentSummaryDto {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  title: string;
  number: string | null;
  currentVersion: number;
  /** Format of the current version (for an icon / preview). */
  mimeType: AllowedMimeType;
  createdAt: string;
  updatedAt: string;
}

/** Document with all versions (newest first) and history (newest first). */
export interface DocumentDetailsDto extends DocumentSummaryDto {
  versions: DocumentVersionDto[];
  history: DocumentHistoryDto[];
}

/** Body of `GET /api/documents`. */
export interface DocumentListResponse {
  items: DocumentSummaryDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Body of single-document responses. */
export interface DocumentResponse {
  document: DocumentDetailsDto;
}
