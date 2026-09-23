import type { LoginInput } from '@driver-docs/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as authApi from '../api/auth';
import { setUnauthorizedHandler } from '../api/client';
import { T } from '../i18n/texts';
import { AuthContext, type AuthContextValue } from './auth-context';
import { clearSession, readSession, writeSession, type StoredSession } from './session-storage';
import { setAccessToken } from './token-store';

/**
 * Provides the authentication state to the application.
 *
 * - Restores a stored, unexpired session on start and checks it once with
 *   `GET /api/auth/me` (a token revoked by deleting the account logs out).
 * - Keeps the token in the token store read by the API client (updated inside
 *   `login`/`logout`, so requests fired right afterwards already use it), and makes
 *   a 401 on an authenticated request log the user out with a "session expired"
 *   message.
 * - Logs out automatically when the token's lifetime ends.
 *
 * @param props.children - The application.
 * @returns The context provider wrapping `children`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [initial] = useState(() => readSession());
  const [session, setSession] = useState<StoredSession | null>(initial);
  const [logoutReason, setLogoutReason] = useState<string | null>(null);
  const [loggedOutByUser, setLoggedOutByUser] = useState(false);

  const logout = useCallback(
    (reason?: string) => {
      setAccessToken(null);
      clearSession();
      setSession(null);
      setLogoutReason(reason ?? null);
      // Without a reason the user pressed "log out"; with one it was automatic.
      setLoggedOutByUser(reason === undefined);
      queryClient.clear();
    },
    [queryClient],
  );

  const login = useCallback(async (credentials: LoginInput) => {
    const response = await authApi.login(credentials);
    const next: StoredSession = {
      token: response.accessToken,
      user: response.user,
      expiresAt: Date.now() + response.expiresIn * 1000,
    };
    setAccessToken(next.token);
    writeSession(next);
    setLogoutReason(null);
    setLoggedOutByUser(false);
    setSession(next);
  }, []);

  // A 401 can only arrive after a response, i.e. after this effect has run.
  useEffect(() => {
    setUnauthorizedHandler(() => logout(T.login.sessionExpired));
  }, [logout]);

  // Automatic logout when the token expires.
  const expiresAt = session?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setTimeout(
      () => logout(T.login.sessionExpired),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [expiresAt, logout]);

  // Validate a restored session once (the 401 handler logs out if it was revoked).
  useEffect(() => {
    if (initial) authApi.me().catch(() => undefined);
  }, [initial]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      logoutReason,
      loggedOutByUser,
      login,
      logout,
    }),
    [session, logoutReason, loggedOutByUser, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
