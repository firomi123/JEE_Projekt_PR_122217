import { readSession } from './session-storage';

/**
 * Current access token, kept outside React so the API client can read it
 * synchronously from the very first request. It is initialized from the stored
 * session when the module loads, i.e. before any component renders, which matters
 * after a page reload: child components' effects (the first data queries) run
 * before the auth provider's effects.
 */
let accessToken: string | null = readSession()?.token ?? null;

/**
 * Returns the current access token.
 *
 * @returns The token, or `null` when logged out.
 */
export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Replaces the current access token (called on login and logout).
 *
 * @param token - New token, or `null` to clear it.
 */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}
