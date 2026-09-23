import { z } from 'zod';

/** Maximum lengths of the profile fields (equal to the database column sizes). */
export const PROFILE_LIMITS = {
  firstName: 50,
  lastName: 80,
  licenseNumber: 20,
  companyName: 120,
} as const;

/** A personal name: starts with a letter; then letters, spaces, hyphens, apostrophes. */
const NAME_PATTERN = /^\p{L}[\p{L}' -]*$/u;

/**
 * Wraps a string schema into an optional profile field: a missing value, `null`,
 * an empty string or whitespace become `null` ("not filled in"); anything else is
 * validated by `schema`.
 *
 * @param schema - Rules for a filled-in value (receives the untrimmed string).
 * @returns Schema whose output is the validated value or `null`.
 */
function optionalField<T extends z.ZodType<string | null, string>>(schema: T) {
  return z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => (value == null || value.trim() === '' ? null : value))
    .pipe(z.union([z.null(), schema]));
}

/**
 * Builds the schema of a first or last name.
 *
 * @param max - Maximum length after trimming.
 * @param label - Polish field name used in messages (e.g. `Imię`).
 * @returns String schema: trimmed, inner whitespace collapsed, 1–`max` characters,
 *   letters (including Polish), spaces, hyphens and apostrophes only.
 */
function nameSchema(max: number, label: string) {
  return z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(
      z
        .string()
        .max(max, `${label} może mieć najwyżej ${max} znaków`)
        .regex(NAME_PATTERN, `${label} może zawierać tylko litery, spację, myślnik i apostrof`),
    );
}

/**
 * Phone number: digits with an optional leading `+`; spaces, hyphens, dots and
 * parentheses are allowed while typing and removed. 9–15 digits (E.164 maximum).
 * Stored normalized, e.g. `+48 601-234-567` → `+48601234567`.
 */
const phoneSchema = z
  .string()
  .transform((value) => value.replace(/[\s\-().]/g, ''))
  .pipe(
    z.string().regex(/^\+?\d{9,15}$/, 'Podaj poprawny numer telefonu (9–15 cyfr, opcjonalnie +)'),
  );

/**
 * Driving licence number: letters, digits, `/`, `-` and spaces (Polish numbers look
 * like `00123/15/1465`), 4–20 characters. Trimmed and uppercased.
 */
const licenseNumberSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' ').toUpperCase())
  .pipe(
    z
      .string()
      .min(4, 'Numer prawa jazdy musi mieć co najmniej 4 znaki')
      .max(
        PROFILE_LIMITS.licenseNumber,
        `Numer prawa jazdy może mieć najwyżej ${PROFILE_LIMITS.licenseNumber} znaków`,
      )
      .regex(/^[A-Z0-9][A-Z0-9/ -]*$/, 'Numer prawa jazdy może zawierać litery, cyfry, / i -'),
  );

/** Transport company name: any characters, trimmed, at most 120. */
const companyNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .max(
        PROFILE_LIMITS.companyName,
        `Nazwa firmy może mieć najwyżej ${PROFILE_LIMITS.companyName} znaków`,
      ),
  );

/**
 * Driver profile form / `PUT /api/profile` body. PUT replaces the whole profile:
 * a field that is missing, `null` or blank is cleared.
 */
export const profileSchema = z.object({
  firstName: optionalField(nameSchema(PROFILE_LIMITS.firstName, 'Imię')),
  lastName: optionalField(nameSchema(PROFILE_LIMITS.lastName, 'Nazwisko')),
  phone: optionalField(phoneSchema),
  licenseNumber: optionalField(licenseNumberSchema),
  companyName: optionalField(companyNameSchema),
});

/** Profile form data as typed by the user. */
export type ProfileInput = z.input<typeof profileSchema>;
/** Profile data after validation and normalization (`null` = not filled in). */
export type ProfileData = z.output<typeof profileSchema>;

/** Driver profile returned by the API. */
export interface ProfileDto {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  licenseNumber: string | null;
  companyName: string | null;
  /** ISO 8601 timestamp of the last change. */
  updatedAt: string;
}

/** Body of `GET /api/profile` and `PUT /api/profile`. */
export interface ProfileResponse {
  profile: ProfileDto;
}
