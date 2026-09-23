import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './auth.js';

/** A valid registration form; tests change one field at a time. */
const valid = {
  username: 'jan_kowalski',
  email: 'jan@example.com',
  password: 'Tajne123!',
  confirmPassword: 'Tajne123!',
};

/**
 * Validates a registration form and returns the paths of the fields with errors.
 *
 * @param input - Form data to validate.
 * @returns Sorted, de-duplicated field paths with issues (empty when valid).
 */
function errorFields(input: Record<string, unknown>): string[] {
  const result = registerSchema.safeParse(input);
  if (result.success) return [];
  return [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].sort();
}

describe('registerSchema – username', () => {
  it.each([
    ['abc', 'exactly 3 characters'],
    ['a'.repeat(30), 'exactly 30 characters'],
    ['Jan_Kowalski_2', 'letters, digits and underscore'],
    ['___', 'only underscores'],
  ])('accepts %s (%s)', (username) => {
    expect(errorFields({ ...valid, username })).toEqual([]);
  });

  it.each([
    ['ab', 'too short (2)'],
    ['a'.repeat(31), 'too long (31)'],
    ['jan kowalski', 'space inside'],
    ['jan-kowalski', 'hyphen'],
    ['jan.k', 'dot'],
    ['łukasz', 'Polish letter'],
    ['', 'empty'],
    ['   ', 'only whitespace'],
  ])('rejects %j (%s)', (username) => {
    expect(errorFields({ ...valid, username })).toEqual(['username']);
  });

  it('trims surrounding whitespace and lowercases the username', () => {
    const data = registerSchema.parse({ ...valid, username: '  Jan_K  ' });

    expect(data.username).toBe('jan_k');
  });

  it('rejects a missing username with a Polish message', () => {
    const result = registerSchema.safeParse({ ...valid, username: undefined });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Podaj login');
  });
});

describe('registerSchema – email', () => {
  it('lowercases and trims the e-mail', () => {
    expect(registerSchema.parse({ ...valid, email: ' Jan@Example.COM ' }).email).toBe(
      'jan@example.com',
    );
  });

  it.each(['jan', 'jan@', '@example.com', 'jan@example', 'jan kowalski@example.com', ''])(
    'rejects %j',
    (email) => {
      expect(errorFields({ ...valid, email })).toEqual(['email']);
    },
  );

  it('rejects an e-mail longer than 254 characters', () => {
    const email = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`;
    expect(email.length).toBe(255);

    expect(errorFields({ ...valid, email })).toEqual(['email']);
  });
});

describe('registerSchema – password', () => {
  it.each([
    ['Abcdef1!', 'exactly 8 characters with all classes'],
    ['Łódź2026 ', 'Polish uppercase letter and space as special character'],
    [`A1!${'a'.repeat(125)}`, 'exactly 128 characters'],
  ])('accepts %j (%s)', (password) => {
    expect(errorFields({ ...valid, password, confirmPassword: password })).toEqual([]);
  });

  it.each([
    ['Abcde1!', 'Hasło musi mieć co najmniej 8 znaków'],
    ['abcdef1!', 'Hasło musi zawierać wielką literę'],
    ['Abcdefg!', 'Hasło musi zawierać cyfrę'],
    ['Abcdefg1', 'Hasło musi zawierać znak specjalny'],
    [`A1!${'a'.repeat(126)}`, 'Hasło może mieć najwyżej 128 znaków'],
  ])('rejects %j with "%s"', (password, message) => {
    const result = registerSchema.safeParse({ ...valid, password, confirmPassword: password });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain(message);
  });

  it('reports every unmet password rule at once', () => {
    const result = registerSchema.safeParse({ ...valid, password: 'abc', confirmPassword: 'abc' });

    expect(result.error?.issues.filter((i) => i.path[0] === 'password')).toHaveLength(4);
  });

  it('rejects a confirmation that does not match, on the confirmPassword field', () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: 'Tajne123?' });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['confirmPassword'], message: 'Hasła nie są identyczne' }),
    ]);
  });
});

describe('registerSchema – whole form', () => {
  it('reports all invalid fields together', () => {
    expect(errorFields({})).toEqual(['confirmPassword', 'email', 'password', 'username']);
  });

  it('drops unknown fields from the parsed data', () => {
    const data = registerSchema.parse({ ...valid, role: 'admin' });

    expect(data).not.toHaveProperty('role');
  });
});

describe('loginSchema', () => {
  it('lowercases the username and keeps the password as typed', () => {
    expect(loginSchema.parse({ username: ' Jan_K ', password: ' Tajne123! ' })).toEqual({
      username: 'jan_k',
      password: ' Tajne123! ',
    });
  });

  it('does not apply password strength rules (existing accounts can always log in)', () => {
    expect(loginSchema.safeParse({ username: 'jan', password: 'weak' }).success).toBe(true);
  });

  it('requires both fields', () => {
    const result = loginSchema.safeParse({ username: '', password: '' });

    expect(result.error?.issues.map((i) => i.path[0])).toEqual(['username', 'password']);
  });
});
