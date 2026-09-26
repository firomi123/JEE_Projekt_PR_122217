import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { OfflineBanner } from '../components/OfflineBanner';
import { T } from '../i18n/texts';

/** Navigation of the office panel. */
const OFFICE_NAV = [
  { to: '/biuro', label: T.office.navToReview, icon: '📥', end: true },
  { to: '/biuro/wszystkie', label: T.office.navAll, icon: '🗂️', end: false },
];

/**
 * Layout of the office (dispatcher) panel, meant mainly for a desktop browser: a
 * header with the panel name, the user's login and a logout button, the navigation
 * ("to review", "all documents") and a wide content area. On a phone the navigation
 * becomes the same bottom bar as in the driver's part.
 *
 * @returns The layout with the current page rendered in `<Outlet />`.
 */
export function OfficeLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="layout layout--office">
      <header className="topbar">
        <span className="topbar__title">{T.office.appName}</span>
        <span className="topbar__user" data-testid="current-user">
          {user?.username}
        </span>
        <button type="button" className="button button--ghost" onClick={() => logout()}>
          {T.nav.logout}
        </button>
      </header>
      <OfflineBanner />
      <nav className="nav" aria-label={T.office.navigation}>
        {OFFICE_NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="nav__link">
            <span aria-hidden="true" className="nav__icon">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main className="page page--wide">
        <Outlet />
      </main>
    </div>
  );
}
