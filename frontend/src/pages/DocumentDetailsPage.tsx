import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  STATUS_TRANSITIONS,
  type DocumentDetailsDto,
  type DocumentHistoryDto,
  type DocumentStatus,
} from '@driver-docs/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { fetchVersionFile } from '../api/documents';
import { errorMessage } from '../api/errors';
import { Alert } from '../components/Alert';
import { FilePicker } from '../components/FilePicker';
import { StatusBadge } from '../components/StatusBadge';
import { useDocument, useDocumentMutations, useVersionFile } from '../hooks/useDocuments';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { T } from '../i18n/texts';
import { formatBytes, formatDateTime } from '../lib/format';

/**
 * Describes one history entry in Polish.
 *
 * @param entry - History entry from the API.
 * @returns A sentence such as "Status: Roboczy → Przesłany".
 */
function describeHistory(entry: DocumentHistoryDto): string {
  /**
   * Maps a status stored in a history entry to its Polish label.
   * @param value - Status code, or null when the entry has no value.
   * @returns The label, or the "empty value" text for null.
   */
  const status = (value: string | null) =>
    value ? DOCUMENT_STATUS_LABELS[value as DocumentStatus] : T.history.empty;
  switch (entry.action) {
    case 'CREATED':
      return T.history.CREATED;
    case 'DELETED':
      return T.history.DELETED;
    case 'STATUS_CHANGED':
      return T.history.STATUS_CHANGED(status(entry.oldValue), status(entry.newValue));
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
 * Saves a Blob as a file through a temporary `<a download>` link.
 *
 * @param blob - File content.
 * @param fileName - Suggested file name.
 * Side effects: triggers a browser download.
 */
function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Preview of the current version: the image itself, or for a PDF a card with an
 * "open" link. PDFs are not embedded: most mobile browsers cannot display an
 * embedded PDF, and the browser's PDF viewer opened in a new tab is more usable
 * on a phone. The file is fetched with the access token and shown through an
 * object URL.
 *
 * @param props.document - The document.
 * @returns The preview section.
 */
function Preview({ document }: { document: DocumentDetailsDto }) {
  const { data: blob, error } = useVersionFile(document.id, document.currentVersion);
  const url = useObjectUrl(blob);
  return (
    <section aria-labelledby="preview-heading">
      <h2 id="preview-heading">{T.details.preview}</h2>
      {error && <Alert kind="error">{errorMessage(error)}</Alert>}
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
 * Document details: data, preview, status change (only the allowed transitions),
 * editing title and number, versions with download, adding a new version, change
 * history and deletion. An archived document is shown read-only.
 *
 * @returns The details page.
 */
export function DocumentDetailsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: document, error, isPending } = useDocument(id);
  const { update, addVersion, remove } = useDocumentMutations(id);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [versionError, setVersionError] = useState<string>();

  if (isPending) return <p>{T.common.loading}</p>;
  if (error || !document) {
    const notFound = error instanceof ApiError && error.status === 404;
    return <Alert kind="error">{notFound ? T.details.notFound : errorMessage(error)}</Alert>;
  }

  const archived = document.status === 'ARCHIVED';
  /**
   * Shows the outcome of a mutation as the page message: "saved" on success, the
   * Polish error message on failure. Never rejects.
   * @param result - Promise of the mutation.
   * @returns A promise that settles after the message is set.
   */
  const report = (result: Promise<unknown>) =>
    result
      .then(() => setMessage({ kind: 'info', text: T.details.saved }))
      .catch((failure: unknown) => setMessage({ kind: 'error', text: errorMessage(failure) }));

  /**
   * Asks for confirmation and changes the document status (PATCH through the mutation).
   * Does nothing when the user cancels the confirmation dialog.
   * @param status - Target status (one of the allowed transitions).
   */
  const changeStatus = (status: DocumentStatus) => {
    if (!window.confirm(T.details.confirmStatus(DOCUMENT_STATUS_LABELS[status]))) return;
    void report(update.mutateAsync({ status }));
  };

  /**
   * Submits the metadata form: sends the title and number as a PATCH and reports the result.
   * @param event - Submit event of the form (default navigation is prevented).
   */
  const saveMetadata = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void report(
      update.mutateAsync({
        title: String(form.get('title') ?? ''),
        number: String(form.get('number') ?? ''),
      }),
    );
  };

  /**
   * Submits the new-version form: uploads the selected file with the optional change
   * note. On success resets the form and shows 'saved'; on failure, or when no file is
   * selected, shows the error at the file field.
   * @param event - Submit event of the form (default navigation is prevented).
   */
  const uploadVersion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newFile) {
      setVersionError(T.newDocument.fileRequired);
      return;
    }
    const formElement = event.currentTarget;
    const changeNote = String(new FormData(formElement).get('changeNote') ?? '');
    addVersion
      .mutateAsync({ file: newFile, fileName: newFile.name, changeNote })
      .then(() => {
        formElement.reset();
        setNewFile(null);
        setMessage({ kind: 'info', text: T.details.saved });
      })
      .catch((failure: unknown) => setVersionError(errorMessage(failure)));
  };

  /**
   * Asks for confirmation, deletes the document (soft delete in the API) and navigates to
   * the list. On failure shows the error message; does nothing when the user cancels.
   */
  const deleteDocument = () => {
    if (!window.confirm(T.details.confirmDelete)) return;
    remove
      .mutateAsync()
      .then(() => navigate('/', { replace: true }))
      .catch((failure: unknown) => setMessage({ kind: 'error', text: errorMessage(failure) }));
  };

  return (
    <>
      <div className="page-header">
        <h1>{document.title}</h1>
        <StatusBadge status={document.status} />
      </div>
      <p className="muted">
        {DOCUMENT_TYPE_LABELS[document.type]} · {T.details.number}:{' '}
        {document.number ?? T.details.noNumber}
      </p>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      {archived && <Alert kind="info">{T.details.archivedInfo}</Alert>}

      <Preview document={document} />

      {!archived && (
        <section aria-labelledby="status-heading">
          <h2 id="status-heading">{T.details.changeStatus}</h2>
          <div className="actions">
            {STATUS_TRANSITIONS[document.status].map((next) => (
              <button
                key={next}
                type="button"
                className="button button--ghost"
                disabled={update.isPending}
                onClick={() => changeStatus(next)}
              >
                {T.details.statusTo(DOCUMENT_STATUS_LABELS[next])}
              </button>
            ))}
          </div>
        </section>
      )}

      {!archived && (
        <section aria-labelledby="edit-heading">
          <h2 id="edit-heading">{T.details.edit}</h2>
          <form onSubmit={saveMetadata} key={document.updatedAt}>
            <div className="field">
              <label htmlFor="edit-title">{T.details.editTitle}</label>
              <input id="edit-title" name="title" defaultValue={document.title} required />
            </div>
            <div className="field">
              <label htmlFor="edit-number">{T.details.editNumber}</label>
              <input id="edit-number" name="number" defaultValue={document.number ?? ''} />
            </div>
            <button type="submit" className="button button--primary" disabled={update.isPending}>
              {T.common.save}
            </button>
          </form>
        </section>
      )}

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
                  fetchVersionFile(document.id, version.versionNo)
                    .then((blob) =>
                      saveBlob(
                        blob,
                        `${document.title}-v${version.versionNo}.${version.mimeType.split('/')[1]}`,
                      ),
                    )
                    .catch((failure: unknown) =>
                      setMessage({ kind: 'error', text: errorMessage(failure) }),
                    )
                }
              >
                {T.details.download}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {!archived && (
        <section aria-labelledby="new-version-heading">
          <h2 id="new-version-heading">{T.details.newVersion}</h2>
          <form onSubmit={uploadVersion}>
            <FilePicker
              label={T.details.newVersionFile}
              error={versionError}
              onChange={(chosen) => {
                setNewFile(chosen);
                setVersionError(undefined);
              }}
            />
            <div className="field">
              <label htmlFor="new-version-note">{T.details.newVersionNote}</label>
              <input id="new-version-note" name="changeNote" />
            </div>
            <button
              type="submit"
              className="button button--primary"
              disabled={addVersion.isPending}
            >
              {T.details.newVersionSubmit}
            </button>
          </form>
        </section>
      )}

      <section aria-labelledby="history-heading">
        <h2 id="history-heading">{T.details.history}</h2>
        <ol className="plain-list" data-testid="history">
          {document.history.map((entry, index) => (
            <li key={`${entry.createdAt}-${index}`}>
              <span className="muted">{formatDateTime(entry.createdAt)}</span> ·{' '}
              {describeHistory(entry)}
            </li>
          ))}
        </ol>
      </section>

      <button type="button" className="button button--danger" onClick={deleteDocument}>
        {T.details.delete}
      </button>
    </>
  );
}
