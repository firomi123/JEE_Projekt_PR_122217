import type { LoginInput } from '@driver-docs/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as authApi from '../api/auth';
import { configureApiClient } from '../api/client';
import { T } from '../i18n/texts';
import { AuthContext, type AuthContextValue } from './auth-context';
import { clearSession, readSession, writeSession, type StoredSession } from './session-storage';

/**
 * Provides the authentication state to the application.
 *
 * - Restores a stored, unexpired session on start and checks it once with
 *   `GET /api/auth/me` (a token revoked by deleting the account logs out).
 * - Connects the API client: every request carries the token, and a 401 on an
 *   authenticated request logs the user out with a "session expired" message.
 * - Logs out automatically when the token's lifetime ends.
 *
 * The token is also kept in a ref that is updated inside `login`/`logout`
 * themselves, so requests fired right after logging in (even by child effects,
 * which run before this component's effects) already carry it.
 *
 * @param props.children - The application.
 * @returns The context provider wrapping `children`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [initial] = useState(() => readSession());
  const [session, setSession] = useState<StoredSession | null>(initial);
  const [logoutReason, setLogoutReason] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(initial?.token ?? null);

  const logout = useCallback(
    (reason?: string) => {
      tokenRef.current = null;
      clearSession();
      setSession(null);
      setLogoutReason(reason ?? null);
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
    tokenRef.current = next.token;
    writeSession(next);
    setLogoutReason(null);
    setSession(next);
  }, []);

  // Connect the API client once; it reads the token through the ref.
  useEffect(() => {
    configureApiClient(
      () => tokenRef.current,
      () => logout(T.login.sessionExpired),
    );
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
      login,
      logout,
    }),
    [session, logoutReason, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
