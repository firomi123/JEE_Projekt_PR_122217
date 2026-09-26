import type { DocumentHistoryDto } from '@driver-docs/shared';
import { describe, expect, it } from 'vitest';
import { describeHistory, historyAuthor, latestRejection } from './history';

/**
 * Builds a history entry for the tests.
 * @param overrides - Fields that differ from a driver's CREATED entry.
 * @returns The entry.
 */
function entry(overrides: Partial<DocumentHistoryDto> = {}): DocumentHistoryDto {
  return {
    action: 'CREATED',
    field: null,
    oldValue: null,
    newValue: null,
    comment: null,
    changedBy: { username: 'jan', role: 'DRIVER' },
    createdAt: '2026-09-26T19:13:00.000Z',
    ...overrides,
  };
}

describe('describeHistory', () => {
  it('describes a status change with Polish labels', () => {
    expect(
      describeHistory(
        entry({
          action: 'STATUS_CHANGED',
          field: 'status',
          oldValue: 'SUBMITTED',
          newValue: 'REJECTED',
        }),
      ),
    ).toBe('Status: Przesłany → Odrzucony');
  });

  it('describes a field change and a new version', () => {
    expect(
      describeHistory(
        entry({ action: 'UPDATED', field: 'number', oldValue: null, newValue: 'PL 1' }),
      ),
    ).toBe('Zmieniono numer: „—” → „PL 1”');
    expect(describeHistory(entry({ action: 'VERSION_ADDED', newValue: '2' }))).toBe(
      'Dodano wersję 2',
    );
  });
});

describe('historyAuthor', () => {
  it('names the office worker and says nothing about the driver', () => {
    expect(historyAuthor(entry({ changedBy: { username: 'anna', role: 'OFFICE' } }))).toBe(
      'biuro: anna',
    );
    expect(historyAuthor(entry())).toBeNull();
  });
});

describe('latestRejection', () => {
  it('returns the reason of the newest rejection', () => {
    const history = [
      entry({ action: 'STATUS_CHANGED', oldValue: 'REJECTED', newValue: 'SUBMITTED' }),
      entry({
        action: 'STATUS_CHANGED',
        oldValue: 'SUBMITTED',
        newValue: 'REJECTED',
        comment: 'Brak pieczątki',
      }),
      entry({
        action: 'STATUS_CHANGED',
        oldValue: 'SUBMITTED',
        newValue: 'REJECTED',
        comment: 'Stary',
      }),
    ];

    expect(latestRejection(history)).toBe('Brak pieczątki');
  });

  it('returns null when the document was never rejected', () => {
    expect(latestRejection([entry()])).toBeNull();
  });
});
