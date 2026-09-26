import type { UserRole } from '@driver-docs/shared';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { homePath, isPathOfRole } from './roles';
import { useAuth } from './useAuth';

/** Router state used to remember where an unauthenticated user wanted to go. */
export interface RedirectState {
  from?: string;
}

/**
 * Route guard: renders its children only for a logged-in user; otherwise
 * redirects to the login screen, remembering the requested address so the user
 * returns there after logging in (an opened link, an expired session). After an
 * explicit logout nothing is remembered, so the next login starts at the list.
 *
 * @param props.children - Protected content.
 * @returns The children, or a redirect to `/logowanie`.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loggedOutByUser } = useAuth();
  const location = useLocation();
  if (!user) {
    if (loggedOutByUser) return <Navigate to="/logowanie" replace />;
    const state: RedirectState = { from: location.pathname + location.search };
    return <Navigate to="/logowanie" replace state={state} />;
  }
  return children;
}

/**
 * Route guard for one role, used inside {@link RequireAuth}: a user of another role
 * is sent to the start page of his own role (the office to `/biuro`, a driver to `/`).
 *
 * @param props.role - The only role allowed.
 * @param props.children - Content of that role.
 * @returns The children, or a redirect.
 */
export function RequireRole({ role, children }: { role: UserRole; children: ReactNode }) {
  const { user } = useAuth();
  if (user && user.role !== role) return <Navigate to={homePath(user.role)} replace />;
  return children;
}

/**
 * Route guard for pages meant for logged-out users (login, registration): a
 * logged-in user is sent on to the address remembered by {@link RequireAuth} if it
 * belongs to his role, otherwise to the start page of his role.
 *
 * @param props.children - Guest-only content.
 * @returns The children, or a redirect.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user) {
    const from = (location.state as RedirectState | null)?.from;
    const target =
      from && from.startsWith('/') && isPathOfRole(from, user.role) ? from : homePath(user.role);
    return <Navigate to={target} replace />;
  }
  return children;
}
