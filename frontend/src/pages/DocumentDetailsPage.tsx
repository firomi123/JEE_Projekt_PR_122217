import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  ROLE_STATUS_TRANSITIONS,
  type DocumentStatus,
} from '@driver-docs/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { fetchVersionFile } from '../api/documents';
import { errorMessage } from '../api/errors';
import { Alert } from '../components/Alert';
import { DocumentPreview, HistoryList, VersionList } from '../components/DocumentParts';
import { FilePicker } from '../components/FilePicker';
import { StatusBadge } from '../components/StatusBadge';
import { useDocument, useDocumentMutations, useVersionFile } from '../hooks/useDocuments';
import { T } from '../i18n/texts';
import { latestRejection } from '../lib/history';

/**
 * Document details for the driver: data, the office's decision (a rejection with
 * its reason), preview, status change (only the transitions the driver makes –
 * accepting and rejecting is up to the office), editing title and number, versions
 * with download, adding a new version, change history and deletion. An archived
 * document is shown read-only.
 *
 * @returns The details page.
 */
export function DocumentDetailsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: document, error, isPending } = useDocument(id);
  const { update, addVersion, remove } = useDocumentMutations(id);
  const file = useVersionFile(id, document?.currentVersion);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [versionError, setVersionError] = useState<string>();

  if (isPending) return <p>{T.common.loading}</p>;
  if (error || !document) {
    const notFound = error instanceof ApiError && error.status === 404;
    return <Alert kind="error">{notFound ? T.details.notFound : errorMessage(error)}</Alert>;
  }

  const archived = document.status === 'ARCHIVED';
  const driverTransitions = ROLE_STATUS_TRANSITIONS.DRIVER[document.status] ?? [];
  const rejection = document.status === 'REJECTED' ? latestRejection(document.history) : null;
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
      {document.status === 'SUBMITTED' && <Alert kind="info">{T.details.waitingForOffice}</Alert>}
      {document.status === 'ACCEPTED' && <Alert kind="info">{T.details.acceptedByOffice}</Alert>}
      {document.status === 'REJECTED' && (
        <div className="alert alert--error" role="alert" data-testid="rejection">
          <strong>{T.details.rejectedByOffice}</strong>
          {rejection && <p className="rejection-reason">{T.details.rejectionReason(rejection)}</p>}
        </div>
      )}

      <DocumentPreview document={document} blob={file.data} error={file.error} />

      {!archived && driverTransitions.length > 0 && (
        <section aria-labelledby="status-heading">
          <h2 id="status-heading">{T.details.changeStatus}</h2>
          <div className="actions">
            {driverTransitions.map((next) => (
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

      <VersionList
        document={document}
        fetchFile={fetchVersionFile}
        onError={(failure) => setMessage({ kind: 'error', text: errorMessage(failure) })}
      />

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

      <HistoryList history={document.history} />

      <button type="button" className="button button--danger" onClick={deleteDocument}>
        {T.details.delete}
      </button>
    </>
  );
}
