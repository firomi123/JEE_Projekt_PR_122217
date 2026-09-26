import type { DriverDto } from '@driver-docs/shared';

/**
 * Name of a driver as the office sees it: first and last name from the profile
 * with the login in parentheses, or only the login when the profile has no name.
 *
 * @param driver - Driver from the office API.
 * @returns E.g. "Jan Kowalski (jan_k)" or "jan_k".
 */
export function driverName(driver: Pick<DriverDto, 'username' | 'firstName' | 'lastName'>): string {
  const fullName = [driver.firstName, driver.lastName].filter(Boolean).join(' ');
  return fullName ? `${fullName} (${driver.username})` : driver.username;
}
