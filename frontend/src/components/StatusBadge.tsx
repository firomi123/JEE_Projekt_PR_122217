import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from '@driver-docs/shared';

/**
 * Coloured label of a document status (colour and text, so it does not rely on
 * colour alone).
 *
 * @param props.status - Document status.
 * @returns The badge.
 */
export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span className={`badge badge--${status.toLowerCase()}`} data-status={status}>
      {DOCUMENT_STATUS_LABELS[status]}
    </span>
  );
}
