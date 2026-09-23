import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './auth-context';

/**
 * Returns the authentication state and actions.
 *
 * @returns The value provided by `AuthProvider`.
 * @throws {Error} If used outside `AuthProvider` (a programming error).
 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
