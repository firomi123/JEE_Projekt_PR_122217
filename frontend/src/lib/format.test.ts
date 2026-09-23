import { describe, expect, it } from 'vitest';
import { formatBytes } from './format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1 kB'],
    [1536, '1,5 kB'],
    [10 * 1024 * 1024, '10 MB'],
    [2.44 * 1024 * 1024, '2,4 MB'],
  ])('formats %d bytes as %s', (bytes, expected) => {
    // Intl may use a narrow no-break space; compare with normal spaces.
    expect(formatBytes(bytes).replace(/\s/g, ' ')).toBe(expected);
  });
});
