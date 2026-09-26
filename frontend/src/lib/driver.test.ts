import { describe, expect, it } from 'vitest';
import { driverName } from './driver';

describe('driverName', () => {
  it('shows the full name with the login', () => {
    expect(driverName({ username: 'jan_k', firstName: 'Jan', lastName: 'Kowalski' })).toBe(
      'Jan Kowalski (jan_k)',
    );
  });

  it('uses whatever part of the name exists, or only the login', () => {
    expect(driverName({ username: 'jan_k', firstName: 'Jan', lastName: null })).toBe('Jan (jan_k)');
    expect(driverName({ username: 'jan_k', firstName: null, lastName: null })).toBe('jan_k');
  });
});
