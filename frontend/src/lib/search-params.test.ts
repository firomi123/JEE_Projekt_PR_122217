import { describe, expect, it } from 'vitest';
import { mergeSearchParams } from './search-params';

describe('mergeSearchParams', () => {
  it('keeps the other filters and resets the page when a filter changes', () => {
    const next = mergeSearchParams('?status=ACCEPTED&page=3', { q: 'Gdańsk' });
    expect(next.get('status')).toBe('ACCEPTED');
    expect(next.get('q')).toBe('Gdańsk');
    expect(next.has('page')).toBe(false);
  });

  it('removes a parameter set to an empty string', () => {
    expect(mergeSearchParams('q=abc&type=WZ', { q: '' }).toString()).toBe('type=WZ');
  });

  it('keeps the page when the page itself changes', () => {
    expect(mergeSearchParams('type=WZ', { page: '2' }).toString()).toBe('type=WZ&page=2');
  });
});
