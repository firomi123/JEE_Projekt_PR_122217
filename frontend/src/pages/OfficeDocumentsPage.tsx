import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  type DocumentStatus,
  type DocumentType,
} from '@driver-docs/shared';
import { useEffect, useEffectEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { errorMessage } from '../api/errors';
import { Alert } from '../components/Alert';
import { SelectField } from '../components/SelectField';
import { StatusBadge } from '../components/StatusBadge';
import { useDrivers, useOfficeDocumentList } from '../hooks/useOffice';
import { T } from '../i18n/texts';
import { driverName } from '../lib/driver';
import { formatDateTime } from '../lib/format';

/** Page size of the office list. */
const PAGE_SIZE = 25;
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
 * Office list of the documents of all drivers, as a table (on a phone the rows
 * become cards). Two views share this page: "to review" (only SUBMITTED documents)
 * and "all documents" (with a status filter), both newest change first. The
 * driver, type and text filters and the page are kept in the URL, like in the
 * driver's list; each title links to the office document view.
 *
 * @param props.toReview - `true` for the "to review" view (status fixed to SUBMITTED).
 * @returns The list page.
 */
export function OfficeDocumentsPage({ toReview }: { toReview: boolean }) {
  const [params, setParams] = useSearchParams();
  const type = pick<DocumentType>(params.get('type'), DOCUMENT_TYPES);
  const status = toReview
    ? 'SUBMITTED'
    : pick<DocumentStatus>(params.get('status'), DOCUMENT_STATUSES);
  const driverId = params.get('driverId') ?? '';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(q);
  const drivers = useDrivers();
  const { data, error, isPending } = useOfficeDocumentList({
    type,
    status,
    driverId: driverId || undefined,
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

  /**
   * Applies the typed search text to the URL. An effect event always sees the
   * latest render, so a filter changed while the delay was running is kept (a plain
   * closure from the time of typing would write back the old filters).
   *
   * @param text - Text typed in the search box.
   */
  const applySearch = useEffectEvent((text: string) => update({ q: text.trim() }));

  // Debounced search: apply the typed text shortly after the user stops typing.
  useEffect(() => {
    if (search === q) return;
    const timer = window.setTimeout(() => applySearch(search), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, q]);

  const driverOptions: [string, string][] = [
    ['', T.office.allDrivers],
    ...(drivers.data ?? []).map((driver): [string, string] => [driver.id, driverName(driver)]),
  ];
  const typeOptions: [string, string][] = [
    ['', T.documents.all],
    ...DOCUMENT_TYPES.map((t): [string, string] => [t, DOCUMENT_TYPE_LABELS[t]]),
  ];
  const statusOptions: [string, string][] = [
    ['', T.documents.all],
    ...DOCUMENT_STATUSES.map((s): [string, string] => [s, DOCUMENT_STATUS_LABELS[s]]),
  ];
  const filtered = Boolean(type || driverId || q || (!toReview && status));

  return (
    <>
      <div className="page-header">
        <h1>{toReview ? T.office.toReviewTitle : T.office.allTitle}</h1>
      </div>

      <section
        className={`filters filters--office${toReview ? '' : ' filters--with-status'}`}
        aria-label={T.documents.filters}
      >
        <div className="field">
          <label htmlFor="office-search">{T.documents.search}</label>
          <input
            id="office-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <SelectField
          id="office-driver"
          label={T.office.driver}
          options={driverOptions}
          value={driverId}
          onChange={(event) => update({ driverId: event.target.value })}
        />
        <SelectField
          id="office-type"
          label={T.documents.type}
          options={typeOptions}
          value={type ?? ''}
          onChange={(event) => update({ type: event.target.value })}
        />
        {!toReview && (
          <SelectField
            id="office-status"
            label={T.documents.status}
            options={statusOptions}
            value={status ?? ''}
            onChange={(event) => update({ status: event.target.value })}
          />
        )}
      </section>

      {error && <Alert kind="error">{errorMessage(error)}</Alert>}
      {isPending && <p>{T.common.loading}</p>}

      {data && (
        <>
          <p className="muted" aria-live="polite">
            {T.documents.count(data.total)}
          </p>
          {data.items.length === 0 ? (
            <p>{filtered || !toReview ? T.documents.emptyFiltered : T.office.emptyToReview}</p>
          ) : (
            <table className="office-table">
              <thead>
                <tr>
                  <th scope="col">{T.office.columns.driver}</th>
                  <th scope="col">{T.office.columns.title}</th>
                  <th scope="col">{T.office.columns.type}</th>
                  <th scope="col">{T.office.columns.number}</th>
                  <th scope="col">{T.office.columns.status}</th>
                  <th scope="col">{T.office.columns.version}</th>
                  <th scope="col">{T.office.columns.updated}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((document) => (
                  <tr key={document.id} data-testid="office-row">
                    <td data-label={T.office.columns.driver}>
                      {driverName(document.owner)}
                      {document.owner.companyName && (
                        <span className="muted office-table__sub">
                          {document.owner.companyName}
                        </span>
                      )}
                    </td>
                    <td data-label={T.office.columns.title}>
                      <Link
                        to={`/biuro/dokumenty/${document.id}`}
                        aria-label={T.office.open(document.title)}
                        className="office-table__title"
                      >
                        {document.title}
                      </Link>
                    </td>
                    <td data-label={T.office.columns.type}>
                      {DOCUMENT_TYPE_LABELS[document.type]}
                    </td>
                    <td data-label={T.office.columns.number}>
                      {document.number ?? T.office.noValue}
                    </td>
                    <td data-label={T.office.columns.status}>
                      <StatusBadge status={document.status} />
                    </td>
                    <td data-label={T.office.columns.version}>{document.currentVersion}</td>
                    <td data-label={T.office.columns.updated}>
                      {formatDateTime(document.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
