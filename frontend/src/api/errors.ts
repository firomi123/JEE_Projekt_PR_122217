import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { T } from '../i18n/texts';
import { ApiError } from './client';

/**
 * Turns any error from an API call into a Polish message for the user.
 *
 * @param error - Usually an {@link ApiError}; anything else is "unexpected".
 * @returns A sentence that can be shown in an alert.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK_ERROR') return T.common.networkError;
    if (error.code === 'INVALID_CREDENTIALS') return T.login.invalidCredentials;
    if (error.code === 'TOO_MANY_REQUESTS') {
      return T.login.tooManyAttempts(Math.max(1, Math.ceil((error.retryAfterSeconds ?? 900) / 60)));
    }
    if (error.code === 'TOKEN_EXPIRED' || error.code === 'UNAUTHORIZED') {
      return T.login.sessionExpired;
    }
    // Field-level problems carry Polish messages from the shared schemas.
    const first = error.details[0]?.message;
    if (first) return first;
  }
  return T.common.unexpectedError;
}

/**
 * Shows the API's per-field errors (400 / 409 `details`) next to the matching form
 * inputs.
 *
 * @param error - Error from an API call.
 * @param setError - `setError` of the react-hook-form instance.
 * @param fields - Names of the form fields; issues for other paths are ignored.
 * @returns `true` if at least one field error was set (the caller then does not
 *   need a general message), otherwise `false`.
 */
export function applyFieldErrors<F extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<F>,
  fields: readonly Path<F>[],
): boolean {
  if (!(error instanceof ApiError)) return false;
  let applied = false;
  for (const issue of error.details) {
    const field = fields.find((name) => name === issue.path);
    if (field) {
      setError(field, { type: 'server', message: issue.message }, { shouldFocus: !applied });
      applied = true;
    }
  }
  return applied;
}
