import { describe, expect, it } from 'vitest';
import type { UserRole } from './auth.js';
import {
  canChangeStatus,
  canTransition,
  createDocumentSchema,
  DOCUMENT_STATUSES,
  listDocumentsQuerySchema,
  officeListQuerySchema,
  reviewDocumentSchema,
  ROLE_STATUS_TRANSITIONS,
  STATUS_TRANSITIONS,
  updateDocumentSchema,
  type DocumentStatus,
} from './documents.js';

describe('status changes by role', () => {
  it.each([
    ['DRIVER', 'DRAFT', 'SUBMITTED'],
    ['DRIVER', 'DRAFT', 'ARCHIVED'],
    ['DRIVER', 'SUBMITTED', 'DRAFT'],
    ['DRIVER', 'REJECTED', 'DRAFT'],
    ['DRIVER', 'REJECTED', 'SUBMITTED'],
    ['DRIVER', 'REJECTED', 'ARCHIVED'],
    ['DRIVER', 'ACCEPTED', 'ARCHIVED'],
    ['OFFICE', 'SUBMITTED', 'ACCEPTED'],
    ['OFFICE', 'SUBMITTED', 'REJECTED'],
  ] as [UserRole, DocumentStatus, DocumentStatus][])('lets %s change %s → %s', (role, from, to) => {
    expect(canChangeStatus(role, from, to)).toBe(true);
  });

  it.each([
    ['DRIVER', 'SUBMITTED', 'ACCEPTED', 'a driver cannot accept his own document'],
    ['DRIVER', 'SUBMITTED', 'REJECTED', 'only the office rejects'],
    ['OFFICE', 'DRAFT', 'SUBMITTED', 'only the driver submits'],
    ['OFFICE', 'ACCEPTED', 'ARCHIVED', 'the driver archives his documents'],
    ['OFFICE', 'DRAFT', 'ACCEPTED', 'not a transition at all'],
  ] as [UserRole, DocumentStatus, DocumentStatus, string][])(
    'does not let %s change %s → %s (%s)',
    (role, from, to) => {
      expect(canChangeStatus(role, from, to)).toBe(false);
    },
  );

  it('splits exactly the transitions of the status machine between the roles', () => {
    for (const from of DOCUMENT_STATUSES) {
      const byRoles = [
        ...(ROLE_STATUS_TRANSITIONS.DRIVER[from] ?? []),
        ...(ROLE_STATUS_TRANSITIONS.OFFICE[from] ?? []),
      ].sort();
      expect(byRoles).toEqual([...STATUS_TRANSITIONS[from]].sort());
    }
  });
});

describe('reviewDocumentSchema', () => {
  it('accepts an acceptance without a comment and turns a blank comment into null', () => {
    expect(reviewDocumentSchema.parse({ decision: 'ACCEPTED' })).toEqual({
      decision: 'ACCEPTED',
      comment: null,
    });
    expect(reviewDocumentSchema.parse({ decision: 'ACCEPTED', comment: '  ' }).comment).toBeNull();
  });

  it('requires the reason of a rejection (Polish message at the comment field)', () => {
    const result = reviewDocumentSchema.safeParse({ decision: 'REJECTED', comment: ' ' });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['comment'], message: 'Podaj powód odrzucenia' }),
    ]);
  });

  it('trims the comment, limits it to 500 characters and rejects other decisions', () => {
    expect(
      reviewDocumentSchema.parse({ decision: 'REJECTED', comment: ' Brak pieczątki ' }).comment,
    ).toBe('Brak pieczątki');
    expect(
      reviewDocumentSchema.safeParse({ decision: 'REJECTED', comment: 'x'.repeat(501) }).success,
    ).toBe(false);
    expect(reviewDocumentSchema.safeParse({ decision: 'ARCHIVED' }).success).toBe(false);
  });
});

describe('officeListQuerySchema', () => {
  it('adds an optional driver filter that must be a UUID', () => {
    const driverId = '5f0e7c7a-0000-4000-8000-000000000000';
    expect(officeListQuerySchema.parse({ driverId })).toMatchObject({ driverId, page: 1 });
    expect(officeListQuerySchema.parse({ driverId: '' }).driverId).toBeUndefined();
    expect(officeListQuerySchema.safeParse({ driverId: 'jan' }).success).toBe(false);
  });
});

describe('status transitions', () => {
  it.each([
    ['DRAFT', 'SUBMITTED'],
    ['DRAFT', 'ARCHIVED'],
    ['SUBMITTED', 'ACCEPTED'],
    ['SUBMITTED', 'REJECTED'],
    ['SUBMITTED', 'DRAFT'],
    ['REJECTED', 'DRAFT'],
    ['REJECTED', 'SUBMITTED'],
    ['REJECTED', 'ARCHIVED'],
    ['ACCEPTED', 'ARCHIVED'],
  ] as [DocumentStatus, DocumentStatus][])('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['DRAFT', 'ACCEPTED', 'cannot accept a document that was never submitted'],
    ['DRAFT', 'REJECTED', 'cannot reject a document that was never submitted'],
    ['ACCEPTED', 'DRAFT', 'an accepted document cannot be edited again'],
    ['ACCEPTED', 'REJECTED', 'an accepted document cannot be rejected'],
    ['ARCHIVED', 'DRAFT', 'archived is final'],
    ['ARCHIVED', 'SUBMITTED', 'archived is final'],
  ] as [DocumentStatus, DocumentStatus, string][])('forbids %s → %s (%s)', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('never treats keeping the same status as a transition', () => {
    for (const status of DOCUMENT_STATUSES) expect(canTransition(status, status)).toBe(false);
  });

  it('defines transitions for every status and ARCHIVED has none', () => {
    expect(Object.keys(STATUS_TRANSITIONS).sort()).toEqual([...DOCUMENT_STATUSES].sort());
    expect(STATUS_TRANSITIONS.ARCHIVED).toEqual([]);
  });

  it('lets every status except ARCHIVED eventually reach ARCHIVED', () => {
    /**
     * Depth-first search over `STATUS_TRANSITIONS`: can ARCHIVED be reached from `status`?
     * @param status - Starting status.
     * @param seen - Statuses already visited (prevents cycles); mutated.
     * @returns True when some chain of allowed transitions ends in ARCHIVED.
     */
    const reachesArchived = (status: DocumentStatus, seen = new Set<DocumentStatus>()): boolean => {
      if (status === 'ARCHIVED') return true;
      seen.add(status);
      return STATUS_TRANSITIONS[status].some(
        (next) => !seen.has(next) && reachesArchived(next, seen),
      );
    };
    for (const status of DOCUMENT_STATUSES) expect(reachesArchived(status)).toBe(true);
  });
});

describe('createDocumentSchema', () => {
  it('accepts type and title, trims them and turns a blank number into null', () => {
    expect(
      createDocumentSchema.parse({ type: 'CMR', title: '  CMR Poznań  ', number: ' ' }),
    ).toEqual({ type: 'CMR', title: 'CMR Poznań', number: null, changeNote: null });
  });

  it('rejects an unknown type and a missing title with Polish messages', () => {
    const result = createDocumentSchema.safeParse({ type: 'PASSPORT', title: '   ' });

    expect(result.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
      ['type', 'Wybierz typ dokumentu'],
      ['title', 'Podaj tytuł dokumentu'],
    ]);
  });

  it('enforces the title (200) and number (50) limits', () => {
    expect(
      createDocumentSchema.safeParse({ type: 'WZ', title: 'x'.repeat(200), number: 'n'.repeat(50) })
        .success,
    ).toBe(true);
    const result = createDocumentSchema.safeParse({
      type: 'WZ',
      title: 'x'.repeat(201),
      number: 'n'.repeat(51),
    });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(['title', 'number']);
  });
});

describe('updateDocumentSchema', () => {
  it('requires at least one field', () => {
    expect(updateDocumentSchema.safeParse({}).success).toBe(false);
  });

  it('keeps omitted fields undefined and turns an empty number into null', () => {
    expect(updateDocumentSchema.parse({ number: '' })).toEqual({ number: null });
    expect(updateDocumentSchema.parse({ status: 'SUBMITTED' })).toEqual({ status: 'SUBMITTED' });
  });

  it('rejects an unknown status', () => {
    expect(updateDocumentSchema.safeParse({ status: 'LOST' }).success).toBe(false);
  });
});

describe('listDocumentsQuerySchema', () => {
  it('applies defaults and converts page numbers from the query string', () => {
    expect(listDocumentsQuerySchema.parse({ page: '3' })).toEqual({ page: 3, pageSize: 20 });
  });

  it('drops a blank search and rejects out-of-range paging', () => {
    expect(listDocumentsQuerySchema.parse({ q: '  ' }).q).toBeUndefined();
    expect(listDocumentsQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(listDocumentsQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
  });
});
