import { describe, expect, it } from 'vitest';
import { homePath, isPathOfRole } from './roles';

describe('homePath', () => {
  it('sends a driver to the list and the office to its panel', () => {
    expect(homePath('DRIVER')).toBe('/');
    expect(homePath('OFFICE')).toBe('/biuro');
  });
});

describe('isPathOfRole', () => {
  it.each([
    ['/biuro', 'OFFICE', true],
    ['/biuro/dokumenty/1', 'OFFICE', true],
    ['/biuro?driverId=1', 'OFFICE', true],
    ['/dokumenty/1', 'OFFICE', false],
    ['/', 'DRIVER', true],
    ['/profil', 'DRIVER', true],
    ['/biuro/dokumenty/1', 'DRIVER', false],
    ['/biurowiec', 'DRIVER', true],
  ] as const)('%s belongs to %s: %s', (path, role, expected) => {
    expect(isPathOfRole(path, role)).toBe(expected);
  });
});
