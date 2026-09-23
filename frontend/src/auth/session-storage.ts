import type { UserDto } from '@driver-docs/shared';

/** Key under which the session is kept in `localStorage`. */
const STORAGE_KEY = 'driver-docs.session';

/** A stored login session. */
export interface StoredSession {
  token: string;
  user: UserDto;
  /** Expiry time of the token, milliseconds since the epoch. */
  expiresAt: number;
}

/**
 * Reads the stored session, discarding it when it is malformed or already expired.
 *
 * @param now - Current time in ms (injectable for tests).
 * @returns The session, or `null` if there is no valid one.
 * Side effects: removes an expired or malformed entry from `localStorage`.
 */
export function readSession(now = Date.now()): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof session.token === 'string' &&
      typeof session.expiresAt === 'number' &&
      session.user &&
      session.expiresAt > now
    ) {
      return session as StoredSession;
    }
  } catch {
    // Malformed JSON or storage not available: treat as logged out.
  }
  clearSession();
  return null;
}

/**
 * Stores a session.
 *
 * @param session - Token, user and expiry time.
 * Side effects: writes to `localStorage` (ignored if storage is unavailable).
 */
export function writeSession(session: StoredSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private mode / storage full: the session then lasts until the page is closed.
  }
}

/** Removes the stored session. Side effects: deletes the `localStorage` entry. */
export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage not available: nothing to clear.
  }
}
