import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  reviewDocumentSchema,
  type OfficeDocumentDetailsDto,
  type ReviewDecision,
} from '@driver-docs/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { errorMessage } from '../api/errors';
import { fetchOfficeVersionFile } from '../api/office';
import { Alert } from '../components/Alert';
import { DocumentPreview, HistoryList, VersionList } from '../components/DocumentParts';
import { StatusBadge } from '../components/StatusBadge';
import { useOfficeDocument, useOfficeVersionFile, useReview } from '../hooks/useOffice';
import { T } from '../i18n/texts';
import { driverName } from '../lib/driver';

/**
 * Contact data of the driver who owns the document.
 *
 * @param props.document - Office view of the document (with `owner`).
 * @returns The driver section.
 */
function DriverCard({ document }: { document: OfficeDocumentDetailsDto }) {
  const { owner } = document;
  const rows: [string, string | null][] = [
    [T.office.phone, owner.phone],
    [T.office.company, owner.companyName],
    [T.office.license, owner.licenseNumber],
  ];
  return (
    <section aria-labelledby="driver-heading" className="panel">
      <h2 id="driver-heading">{T.office.driverData}</h2>
      <p className="driver-card__name">{driverName(owner)}</p>
      <dl className="details-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? T.office.noValue}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Decision form of the office for a submitted document: a comment for the driver
 * and the buttons "Akceptuj" and "Odrzuć". A rejection needs a reason; this is
 * checked with the shared schema before sending (the API checks it too).
 *
 * @param props.document - The submitted document.
 * @param props.onDone - Called with the Polish confirmation after a saved decision.
 * @returns The review section.
 */
function ReviewForm({
  document,
  onDone,
}: {
  document: OfficeDocumentDetailsDto;
  onDone: (message: string) => void;
}) {
  const review = useReview(document.id);
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string>();
  const [failure, setFailure] = useState<string>();

  /**
   * Validates and sends the decision.
   *
   * @param decision - ACCEPTED or REJECTED.
   * Side effects: `POST /api/office/documents/:id/review`; on success the document
   * and lists are refreshed and `onDone` is called; errors are shown in the form.
   */
  const decide = (decision: ReviewDecision) => {
    setFailure(undefined);
    const parsed = reviewDocumentSchema.safeParse({ decision, comment });
    if (!parsed.success) {
      setCommentError(parsed.error.issues.find((issue) => issue.path[0] === 'comment')?.message);
      return;
    }
    setCommentError(undefined);
    review
      .mutateAsync(parsed.data)
      .then(() => onDone(T.office.decisionSaved(DOCUMENT_STATUS_LABELS[decision])))
      .catch((error: unknown) => setFailure(errorMessage(error)));
  };

  return (
    <section aria-labelledby="review-heading" className="panel">
      <h2 id="review-heading">{T.office.review}</h2>
      {failure && <Alert kind="error">{failure}</Alert>}
      <div className={`field${commentError ? ' field--invalid' : ''}`}>
        <label htmlFor="review-comment">{T.office.comment}</label>
        <textarea
          id="review-comment"
          rows={3}
          value={comment}
          aria-invalid={commentError ? true : undefined}
          aria-describedby={commentError ? 'review-comment-error' : 'review-comment-hint'}
          onChange={(event) => setComment(event.target.value)}
        />
        {commentError ? (
          <p id="review-comment-error" className="field__error">
            {commentError}
          </p>
        ) : (
          <p id="review-comment-hint" className="field__hint">
            {T.office.commentHint}
          </p>
        )}
      </div>
      <div className="actions">
        <button
          type="button"
          className="button button--primary"
          disabled={review.isPending}
          onClick={() => decide('ACCEPTED')}
        >
          {T.office.accept}
        </button>
        <button
          type="button"
          className="button button--reject"
          disabled={review.isPending}
          onClick={() => decide('REJECTED')}
        >
          {T.office.reject}
        </button>
      </div>
    </section>
  );
}

/**
 * Office view of one document: preview of the current version (large, next to the
 * data on a wide screen), the driver's contact data, the decision form (only for a
 * submitted document), versions with download and the change history with the
 * office's comments. The office cannot edit or delete documents.
 *
 * @returns The office document page.
 */
export function OfficeDocumentPage() {
  const { id = '' } = useParams();
  const { data: document, error, isPending } = useOfficeDocument(id);
  const file = useOfficeVersionFile(id, document?.currentVersion);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  if (isPending) return <p>{T.common.loading}</p>;
  if (error || !document) {
    const notFound = error instanceof ApiError && error.status === 404;
    return <Alert kind="error">{notFound ? T.details.notFound : errorMessage(error)}</Alert>;
  }

  return (
    <>
      <Link to="/biuro" className="back-link">
        {T.office.backToList}
      </Link>
      <div className="page-header">
        <h1>{document.title}</h1>
        <StatusBadge status={document.status} />
      </div>
      <p className="muted">
        {DOCUMENT_TYPE_LABELS[document.type]} · {T.details.number}:{' '}
        {document.number ?? T.details.noNumber}
      </p>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}

      <div className="office-document">
        <div className="office-document__preview">
          <DocumentPreview document={document} blob={file.data} error={file.error} />
        </div>
        <div className="office-document__side">
          <DriverCard document={document} />
          {document.status === 'SUBMITTED' ? (
            <ReviewForm
              key={document.updatedAt}
              document={document}
              onDone={(text) => setMessage({ kind: 'info', text })}
            />
          ) : (
            <Alert kind="info">{T.office.notReviewable}</Alert>
          )}
        </div>
      </div>

      <VersionList
        document={document}
        fetchFile={fetchOfficeVersionFile}
        onError={(failure) => setMessage({ kind: 'error', text: errorMessage(failure) })}
      />
      <HistoryList history={document.history} />
    </>
  );
}
