import {
  DOCUMENT_STATUS_LABELS,
  type DocumentHistoryDto,
  type DocumentStatus,
} from '@driver-docs/shared';
import { T } from '../i18n/texts';

/**
 * Maps a status stored in a history entry to its Polish label.
 *
 * @param value - Status code, or `null` when the entry has no value.
 * @returns The label, or the "empty value" text for `null`.
 */
function statusLabel(value: string | null): string {
  return value ? DOCUMENT_STATUS_LABELS[value as DocumentStatus] : T.history.empty;
}

/**
 * Describes one history entry in Polish.
 *
 * @param entry - History entry from the API.
 * @returns A sentence such as "Status: Roboczy → Przesłany".
 */
export function describeHistory(entry: DocumentHistoryDto): string {
  switch (entry.action) {
    case 'CREATED':
      return T.history.CREATED;
    case 'DELETED':
      return T.history.DELETED;
    case 'STATUS_CHANGED':
      return T.history.STATUS_CHANGED(statusLabel(entry.oldValue), statusLabel(entry.newValue));
    case 'VERSION_ADDED':
      return T.history.VERSION_ADDED(entry.newValue ?? '');
    case 'UPDATED':
      return T.history.UPDATED(
        T.history.fields[entry.field ?? ''] ?? entry.field ?? '',
        entry.oldValue ?? T.history.empty,
        entry.newValue ?? T.history.empty,
      );
  }
}

/**
 * Says who made a change, for changes made by the office (the driver's own changes
 * need no author in his view).
 *
 * @param entry - History entry from the API.
 * @returns E.g. "biuro: anna", or `null` for a change made by a driver.
 */
export function historyAuthor(entry: DocumentHistoryDto): string | null {
  return entry.changedBy.role === 'OFFICE' ? T.history.byOffice(entry.changedBy.username) : null;
}

/**
 * Finds the reason of the latest rejection by the office.
 *
 * @param history - History of a document, newest first (as the API returns it).
 * @returns The comment of the newest change to REJECTED, or `null` if there is none.
 */
export function latestRejection(history: DocumentHistoryDto[]): string | null {
  const entry = history.find(
    (item) => item.action === 'STATUS_CHANGED' && item.newValue === 'REJECTED',
  );
  return entry?.comment ?? null;
}
