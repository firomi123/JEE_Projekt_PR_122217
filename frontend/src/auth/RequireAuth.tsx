import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './useAuth';

/** Router state used to remember where an unauthenticated user wanted to go. */
export interface RedirectState {
  from?: string;
}

/**
 * Route guard: renders its children only for a logged-in user; otherwise
 * redirects to the login screen, remembering the requested address so the user
 * returns there after logging in.
 *
 * @param props.children - Protected content.
 * @returns The children, or a redirect to `/logowanie`.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    const state: RedirectState = { from: location.pathname + location.search };
    return <Navigate to="/logowanie" replace state={state} />;
  }
  return children;
}

/**
 * Route guard for pages meant for logged-out users (login, registration): a
 * logged-in user is sent on to the address remembered by {@link RequireAuth}, or
 * to the documents list.
 *
 * @param props.children - Guest-only content.
 * @returns The children, or a redirect.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user) {
    const from = (location.state as RedirectState | null)?.from;
    return <Navigate to={from && from.startsWith('/') ? from : '/'} replace />;
  }
  return children;
}
