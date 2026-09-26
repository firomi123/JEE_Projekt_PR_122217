import { z } from 'zod';

/** Minimum and maximum length of a username. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/** Minimum password length. The maximum protects the server from hashing huge inputs. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Maximum e-mail length (RFC 5321 path limit). */
export const EMAIL_MAX_LENGTH = 254;

/**
 * Username: 3–30 characters, only letters a–z, digits and `_`.
 * Surrounding whitespace is trimmed and the value is lowercased, so usernames are
 * unique regardless of letter case (`Jan_K` and `jan_k` are the same account).
 */
export const usernameSchema = z
  .string({ error: 'Podaj login' })
  .trim()
  .min(USERNAME_MIN_LENGTH, `Login musi mieć co najmniej ${USERNAME_MIN_LENGTH} znaki`)
  .max(USERNAME_MAX_LENGTH, `Login może mieć najwyżej ${USERNAME_MAX_LENGTH} znaków`)
  .regex(/^[A-Za-z0-9_]+$/, 'Login może zawierać tylko litery (bez polskich znaków), cyfry i _')
  .transform((value) => value.toLowerCase());

/** E-mail address; trimmed and lowercased. */
export const emailSchema = z
  .string({ error: 'Podaj adres e-mail' })
  .trim()
  .max(EMAIL_MAX_LENGTH, 'Adres e-mail jest za długi')
  .pipe(z.email('Podaj poprawny adres e-mail'))
  .transform((value) => value.toLowerCase());

/**
 * New password: 8–128 characters with at least one uppercase letter, one digit and
 * one special character (anything that is not a letter or digit, e.g. `!`, `#`, space).
 * Letters outside ASCII (e.g. `Ł`) count as letters.
 */
export const passwordSchema = z
  .string({ error: 'Podaj hasło' })
  .min(PASSWORD_MIN_LENGTH, `Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków`)
  .max(PASSWORD_MAX_LENGTH, `Hasło może mieć najwyżej ${PASSWORD_MAX_LENGTH} znaków`)
  .regex(/\p{Lu}/u, 'Hasło musi zawierać wielką literę')
  .regex(/\p{N}/u, 'Hasło musi zawierać cyfrę')
  .regex(/[^\p{L}\p{N}]/u, 'Hasło musi zawierać znak specjalny');

/** Registration form / `POST /api/auth/register` body. */
export const registerSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string({ error: 'Powtórz hasło' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Hasła nie są identyczne',
  });

/**
 * Login form / `POST /api/auth/login` body. The password is only checked for
 * presence (and the length cap), not for strength rules, so a policy change never
 * locks out existing accounts.
 */
export const loginSchema = z.object({
  username: z
    .string({ error: 'Podaj login' })
    .trim()
    .min(1, 'Podaj login')
    .max(USERNAME_MAX_LENGTH, 'Nieprawidłowy login lub hasło')
    .transform((value) => value.toLowerCase()),
  password: z
    .string({ error: 'Podaj hasło' })
    .min(1, 'Podaj hasło')
    .max(PASSWORD_MAX_LENGTH, 'Nieprawidłowy login lub hasło'),
});

/** Registration data as typed by the user (before trimming/lowercasing). */
export type RegisterInput = z.input<typeof registerSchema>;
/** Registration data after validation and normalization. */
export type RegisterData = z.output<typeof registerSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type LoginData = z.output<typeof loginSchema>;

/**
 * Account roles. `DRIVER` – a driver who photographs and submits his own documents
 * (every publicly registered account); `OFFICE` – an office worker (dispatcher) who
 * reviews the documents of all drivers (accounts created from the configuration).
 */
export const USER_ROLES = ['DRIVER', 'OFFICE'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Polish names of the roles, shown in the UI. */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  DRIVER: 'Kierowca',
  OFFICE: 'Biuro',
};

/** Public user data returned by the API (never contains the password hash). */
export interface UserDto {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/** Body of `201 POST /api/auth/register`. */
export interface RegisterResponse {
  user: UserDto;
}

/** Body of `200 POST /api/auth/login`. */
export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  /** Token lifetime in seconds. */
  expiresIn: number;
  user: UserDto;
}

/** Body of `200 GET /api/auth/me`. */
export interface MeResponse {
  user: UserDto;
}
