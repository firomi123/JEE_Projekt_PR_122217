import type { DocumentDetailsDto, DocumentHistoryDto } from '@driver-docs/shared';
import { errorMessage } from '../api/errors';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { T } from '../i18n/texts';
import { saveBlob } from '../lib/download';
import { formatBytes, formatDateTime } from '../lib/format';
import { describeHistory, historyAuthor } from '../lib/history';
import { Alert } from './Alert';

/**
 * Preview of the current version: the image itself, or for a PDF a card with an
 * "open" link. PDFs are not embedded: most mobile browsers cannot display an
 * embedded PDF, and the browser's PDF viewer opened in a new tab is more usable.
 * The file is shown through an object URL of the Blob loaded by the caller.
 *
 * @param props.document - The document (title and MIME type of the current version).
 * @param props.blob - The loaded file, or `undefined` while loading.
 * @param props.error - Loading error, if any.
 * @returns The preview section.
 */
export function DocumentPreview({
  document,
  blob,
  error,
}: {
  document: DocumentDetailsDto;
  blob: Blob | undefined;
  error: unknown;
}) {
  const url = useObjectUrl(blob);
  return (
    <section aria-labelledby="preview-heading">
      <h2 id="preview-heading">{T.details.preview}</h2>
      {Boolean(error) && <Alert kind="error">{errorMessage(error)}</Alert>}
      {!url && !error && <p>{T.common.loading}</p>}
      {url && document.mimeType !== 'application/pdf' && (
        <img className="preview-image" src={url} alt={T.details.previewAlt(document.title)} />
      )}
      {url && document.mimeType === 'application/pdf' && (
        <div className="preview-pdf" data-testid="pdf-preview">
          <span aria-hidden="true" className="preview-pdf__icon">
            PDF
          </span>
          <a className="button button--ghost" href={url} target="_blank" rel="noreferrer">
            {T.details.openPdf}
          </a>
        </div>
      )}
    </section>
  );
}

/**
 * List of the stored file versions (newest first) with a download button each.
 *
 * @param props.document - The document with its versions.
 * @param props.fetchFile - Loads a version file (driver or office endpoint).
 * @param props.onError - Called with the error when a download fails.
 * @returns The versions section.
 */
export function VersionList({
  document,
  fetchFile,
  onError,
}: {
  document: DocumentDetailsDto;
  fetchFile: (id: string, versionNo: number) => Promise<Blob>;
  onError: (error: unknown) => void;
}) {
  return (
    <section aria-labelledby="versions-heading">
      <h2 id="versions-heading">{T.details.versions}</h2>
      <ul className="plain-list" data-testid="versions">
        {document.versions.map((version) => (
          <li key={version.versionNo} className="row">
            <span>
              <strong>{T.details.versionLabel(version.versionNo)}</strong>
              {` · ${formatBytes(version.sizeBytes)} · ${formatDateTime(version.createdAt)}`}
              {version.changeNote ? ` · ${version.changeNote}` : ''}
            </span>
            <button
              type="button"
              className="button button--ghost"
              aria-label={`${T.details.download}: ${T.details.versionLabel(version.versionNo)}`}
              onClick={() =>
                fetchFile(document.id, version.versionNo)
                  .then((blob) =>
                    saveBlob(
                      blob,
                      `${document.title}-v${version.versionNo}.${version.mimeType.split('/')[1]}`,
                    ),
                  )
                  .catch(onError)
              }
            >
              {T.details.download}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Change history (newest first). Changes made by the office show who made them and
 * the office's comment (e.g. the reason of a rejection).
 *
 * @param props.history - History entries from the API.
 * @returns The history section.
 */
export function HistoryList({ history }: { history: DocumentHistoryDto[] }) {
  return (
    <section aria-labelledby="history-heading">
      <h2 id="history-heading">{T.details.history}</h2>
      <ol className="plain-list" data-testid="history">
        {history.map((entry, index) => {
          const author = historyAuthor(entry);
          return (
            <li key={`${entry.createdAt}-${index}`}>
              <span className="muted">{formatDateTime(entry.createdAt)}</span> ·{' '}
              {describeHistory(entry)}
              {author && <span className="muted"> ({author})</span>}
              {entry.comment && (
                <span className="history-comment">{T.history.comment(entry.comment)}</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
