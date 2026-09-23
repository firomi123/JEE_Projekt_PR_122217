import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  type DocumentStatus,
  type DocumentType,
} from '@driver-docs/shared';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { errorMessage } from '../api/errors';
import { Alert } from '../components/Alert';
import { SelectField } from '../components/SelectField';
import { StatusBadge } from '../components/StatusBadge';
import { useDocumentList } from '../hooks/useDocuments';
import { T } from '../i18n/texts';
import { formatDateTime } from '../lib/format';

/** Page size of the list. */
const PAGE_SIZE = 20;
/** Delay between the last keystroke in the search box and the query. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Reads an enum value from a query parameter.
 *
 * @param value - Raw parameter value.
 * @param allowed - Allowed values.
 * @returns The value if allowed, otherwise `undefined`.
 */
function pick<V extends string>(value: string | null, allowed: readonly V[]): V | undefined {
  return allowed.includes(value as V) ? (value as V) : undefined;
}

/**
 * Document list with filters (type, status), text search and paging. Filters are
 * kept in the URL (`?type=CMR&status=DRAFT&q=…&page=2`), so reloading, sharing a
 * link or going back keeps them. Each row links to the document details.
 *
 * @returns The list page.
 */
export function DocumentsPage() {
  const [params, setParams] = useSearchParams();
  const type = pick<DocumentType>(params.get('type'), DOCUMENT_TYPES);
  const status = pick<DocumentStatus>(params.get('status'), DOCUMENT_STATUSES);
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(q);
  const { data, error, isPending } = useDocumentList({
    type,
    status,
    q,
    page,
    pageSize: PAGE_SIZE,
  });

  /**
   * Updates query parameters, resetting to page 1 unless the page itself changes.
   *
   * @param changes - Parameters to set (empty string removes one).
   */
  const update = (changes: Record<string, string>) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (!('page' in changes)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  // Debounced search: apply the typed text shortly after the user stops typing.
  useEffect(() => {
    if (search === q) return;
    const timer = window.setTimeout(() => update({ q: search.trim() }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  const filtered = Boolean(type || status || q);
  const typeOptions: [string, string][] = [
    ['', T.documents.all],
    ...DOCUMENT_TYPES.map((t): [string, string] => [t, DOCUMENT_TYPE_LABELS[t]]),
  ];
  const statusOptions: [string, string][] = [
    ['', T.documents.all],
    ...DOCUMENT_STATUSES.map((s): [string, string] => [s, DOCUMENT_STATUS_LABELS[s]]),
  ];

  return (
    <>
      <div className="page-header">
        <h1>{T.documents.title}</h1>
        <Link to="/dokumenty/nowy" className="button button--primary button--inline">
          {T.documents.add}
        </Link>
      </div>

      <section className="filters" aria-label={T.documents.filters}>
        <div className="field">
          <label htmlFor="documents-search">{T.documents.search}</label>
          <input
            id="documents-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <SelectField
          id="documents-type"
          label={T.documents.type}
          options={typeOptions}
          value={type ?? ''}
          onChange={(event) => update({ type: event.target.value })}
        />
        <SelectField
          id="documents-status"
          label={T.documents.status}
          options={statusOptions}
          value={status ?? ''}
          onChange={(event) => update({ status: event.target.value })}
        />
      </section>

      {error && <Alert kind="error">{errorMessage(error)}</Alert>}
      {isPending && <p>{T.common.loading}</p>}

      {data && (
        <>
          <p className="muted" aria-live="polite">
            {T.documents.count(data.total)}
          </p>
          {data.items.length === 0 ? (
            <p>{filtered ? T.documents.emptyFiltered : T.documents.empty}</p>
          ) : (
            <ul className="document-list">
              {data.items.map((document) => (
                <li key={document.id}>
                  <Link to={`/dokumenty/${document.id}`} className="document-card">
                    <span className="document-card__title">{document.title}</span>
                    <StatusBadge status={document.status} />
                    <span className="document-card__meta">
                      {DOCUMENT_TYPE_LABELS[document.type]}
                      {document.number ? ` · ${document.number}` : ''}
                      {` · ${T.documents.version(document.currentVersion)}`}
                    </span>
                    <span className="document-card__meta">
                      {T.documents.updated(formatDateTime(document.updatedAt))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data.totalPages > 1 && (
            <nav className="pager" aria-label={T.documents.page(data.page, data.totalPages)}>
              <button
                type="button"
                className="button button--ghost"
                disabled={data.page <= 1}
                onClick={() => update({ page: String(data.page - 1) })}
              >
                {T.documents.previous}
              </button>
              <span>{T.documents.page(data.page, data.totalPages)}</span>
              <button
                type="button"
                className="button button--ghost"
                disabled={data.page >= data.totalPages}
                onClick={() => update({ page: String(data.page + 1) })}
              >
                {T.documents.next}
              </button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
