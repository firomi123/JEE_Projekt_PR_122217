import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { T } from '../i18n/texts';

/** Main navigation entries (bottom bar on phones, top bar on wider screens). */
const NAV_ITEMS = [
  { to: '/', label: T.nav.documents, icon: '📄', end: true },
  { to: '/dokumenty/nowy', label: T.nav.add, icon: '➕', end: false },
  { to: '/profil', label: T.nav.profile, icon: '👤', end: false },
];

/**
 * Layout of the logged-in part of the application: a header with the app name,
 * the user's login and a logout button, the page content, and the main navigation
 * (a fixed bottom bar with large touch targets on phones, inline on desktop).
 *
 * @returns The layout with the current page rendered in `<Outlet />`.
 */
export function AppLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="layout">
      <header className="topbar">
        <span className="topbar__title">{T.appName}</span>
        <span className="topbar__user" data-testid="current-user">
          {user?.username}
        </span>
        <button type="button" className="button button--ghost" onClick={() => logout()}>
          {T.nav.logout}
        </button>
      </header>
      <nav className="nav" aria-label={T.nav.mainNavigation}>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="nav__link">
            <span aria-hidden="true" className="nav__icon">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}

/**
 * Layout of the pages for logged-out users (login, registration): a centered card.
 *
 * @returns The layout with the current page rendered in `<Outlet />`.
 */
export function AuthLayout() {
  return (
    <main className="auth-page">
      <p className="auth-page__brand">{T.appName}</p>
      <div className="card">
        <Outlet />
      </div>
    </main>
  );
}
