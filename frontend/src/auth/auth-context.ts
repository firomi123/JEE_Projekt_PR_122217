import type { LoginInput, UserDto } from '@driver-docs/shared';
import { createContext } from 'react';

/** Authentication state and actions available to components via `useAuth`. */
export interface AuthContextValue {
  /** Logged-in user, or `null` when logged out. */
  user: UserDto | null;
  /** Current access token, or `null`. */
  token: string | null;
  /** Message to show on the login screen after an automatic logout, if any. */
  logoutReason: string | null;
  /**
   * `true` right after the user logged out with the button. Guards then do not
   * remember the page to return to: the next person to log in on this device
   * should start at the document list, not at the previous user's page.
   */
  loggedOutByUser: boolean;
  /**
   * Logs in with username and password and stores the session.
   * @throws {ApiError} On invalid credentials, rate limiting or network errors.
   */
  login: (credentials: LoginInput) => Promise<void>;
  /**
   * Clears the session.
   * @param reason - Optional message for the login screen (e.g. session expired).
   */
  logout: (reason?: string) => void;
}

/** React context holding the authentication state (provided by `AuthProvider`). */
export const AuthContext = createContext<AuthContextValue | null>(null);
