import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { applyFieldErrors, errorMessage } from './errors';

describe('errorMessage', () => {
  it.each([
    [new ApiError(0, 'NETWORK_ERROR', ''), 'Brak połączenia z serwerem'],
    [new ApiError(401, 'INVALID_CREDENTIALS', ''), 'Nieprawidłowy login lub hasło.'],
    [new ApiError(401, 'TOKEN_EXPIRED', ''), 'Sesja wygasła. Zaloguj się ponownie.'],
    [
      new ApiError(400, 'VALIDATION_ERROR', '', [{ path: 'title', message: 'Podaj tytuł' }]),
      'Podaj tytuł',
    ],
    [new ApiError(500, 'INTERNAL_ERROR', ''), 'Coś poszło nie tak'],
    [new Error('boom'), 'Coś poszło nie tak'],
  ])('maps %o to a Polish message', (error, expected) => {
    expect(errorMessage(error)).toContain(expected);
  });

  it('rounds the Retry-After time up to whole minutes for rate limiting', () => {
    const error = new ApiError(429, 'TOO_MANY_REQUESTS', '', [], 61);

    expect(errorMessage(error)).toBe(
      'Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za 2 min.',
    );
  });
});

describe('applyFieldErrors', () => {
  it('sets the API field errors on known fields and focuses the first one', () => {
    const setError = vi.fn();
    const error = new ApiError(409, 'CONFLICT', '', [
      { path: 'username', message: 'Ten login jest już zajęty' },
      { path: 'email', message: 'Konto z tym adresem e-mail już istnieje' },
      { path: 'unknown', message: 'ignored' },
    ]);

    const applied = applyFieldErrors(error, setError, ['username', 'email'] as const);

    expect(applied).toBe(true);
    expect(setError).toHaveBeenCalledTimes(2);
    expect(setError).toHaveBeenNthCalledWith(
      1,
      'username',
      { type: 'server', message: 'Ten login jest już zajęty' },
      { shouldFocus: true },
    );
    expect(setError.mock.calls[1]![2]).toEqual({ shouldFocus: false });
  });

  it('returns false when there are no matching field errors', () => {
    expect(applyFieldErrors(new ApiError(500, 'X', ''), vi.fn(), ['username'] as const)).toBe(
      false,
    );
    expect(applyFieldErrors(new Error('x'), vi.fn(), ['username'] as const)).toBe(false);
  });
});
