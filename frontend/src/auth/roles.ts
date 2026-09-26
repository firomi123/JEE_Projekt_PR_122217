import type { UserRole } from '@driver-docs/shared';

/** Start page of each role: the driver's document list or the office panel. */
const HOME_PATHS: Record<UserRole, string> = {
  DRIVER: '/',
  OFFICE: '/biuro',
};

/**
 * Returns the start page of a role.
 *
 * @param role - Role of the logged-in user.
 * @returns `/` for a driver, `/biuro` for the office.
 */
export function homePath(role: UserRole): string {
  return HOME_PATHS[role];
}

/**
 * Tells whether a remembered address belongs to the part of the application of the
 * given role (so that after logging in the office is not sent to a driver's page
 * and the other way round).
 *
 * @param path - Address remembered before logging in, e.g. `/biuro/dokumenty/…`.
 * @param role - Role of the user who just logged in.
 * @returns `true` if the address is inside the role's part of the application.
 */
export function isPathOfRole(path: string, role: UserRole): boolean {
  const officePath = path === '/biuro' || path.startsWith('/biuro/') || path.startsWith('/biuro?');
  return role === 'OFFICE' ? officePath : !officePath;
}
