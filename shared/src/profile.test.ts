import { describe, expect, it } from 'vitest';
import { profileSchema } from './profile.js';

/**
 * Validates a profile and returns the paths of the fields with errors.
 *
 * @param input - Profile form data.
 * @returns Field names with issues (empty when valid).
 */
function errorFields(input: Record<string, unknown>): string[] {
  const result = profileSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('profileSchema – empty values', () => {
  it('turns a missing, null, empty or blank field into null', () => {
    expect(
      profileSchema.parse({
        firstName: null,
        lastName: '',
        phone: '   ',
        licenseNumber: undefined,
      }),
    ).toEqual({
      firstName: null,
      lastName: null,
      phone: null,
      licenseNumber: null,
      companyName: null,
    });
  });

  it('accepts an empty object (every field is optional)', () => {
    expect(profileSchema.safeParse({}).success).toBe(true);
  });

  it('rejects a non-string value', () => {
    expect(errorFields({ phone: 601234567 })).toEqual(['phone']);
  });
});

describe('profileSchema – names', () => {
  it.each([
    ['Łucja', 'Polish letters'],
    ['Anna-Maria', 'hyphen'],
    ["O'Connor", 'apostrophe'],
    ['Jan Paweł', 'space'],
    ['A', 'single letter'],
  ])('accepts %j (%s)', (firstName) => {
    expect(errorFields({ firstName })).toEqual([]);
  });

  it.each([
    ['Jan2', 'digit'],
    ['-Jan', 'starts with a hyphen'],
    ['Jan!', 'special character'],
  ])('rejects %j (%s)', (firstName) => {
    expect(errorFields({ firstName })).toEqual(['firstName']);
  });

  it('trims and collapses whitespace', () => {
    expect(profileSchema.parse({ lastName: '  Nowak   Kowalska ' }).lastName).toBe(
      'Nowak Kowalska',
    );
  });

  it('enforces the length limits (first name 50, last name 80)', () => {
    expect(errorFields({ firstName: 'a'.repeat(50), lastName: 'b'.repeat(80) })).toEqual([]);
    expect(errorFields({ firstName: 'a'.repeat(51), lastName: 'b'.repeat(81) })).toEqual([
      'firstName',
      'lastName',
    ]);
  });
});

describe('profileSchema – phone', () => {
  it.each([
    ['+48 601 234 567', '+48601234567'],
    ['601-234-567', '601234567'],
    ['(+48) 601.234.567', '+48601234567'],
    ['+123456789012345', '+123456789012345'],
  ])('normalizes %j to %j', (phone, expected) => {
    expect(profileSchema.parse({ phone }).phone).toBe(expected);
  });

  it.each([
    ['60123456', '8 digits'],
    ['+1234567890123456', '16 digits'],
    ['601 234 abc', 'letters'],
    ['48+601234567', '+ not at the start'],
  ])('rejects %j (%s)', (phone) => {
    expect(errorFields({ phone })).toEqual(['phone']);
  });
});

describe('profileSchema – licence number and company', () => {
  it('trims and uppercases the licence number', () => {
    expect(profileSchema.parse({ licenseNumber: ' ab 123/15/1465 ' }).licenseNumber).toBe(
      'AB 123/15/1465',
    );
  });

  it.each([
    ['123', 'too short'],
    ['1'.repeat(21), 'too long'],
    ['123#45', 'invalid character'],
    ['/12345', 'starts with a slash'],
  ])('rejects licence number %j (%s)', (licenseNumber) => {
    expect(errorFields({ licenseNumber })).toEqual(['licenseNumber']);
  });

  it('accepts any characters in the company name up to 120', () => {
    expect(profileSchema.parse({ companyName: ' Trans-Pol Sp. z o.o. & "Syn" ' }).companyName).toBe(
      'Trans-Pol Sp. z o.o. & "Syn"',
    );
    expect(errorFields({ companyName: 'x'.repeat(121) })).toEqual(['companyName']);
  });
});
