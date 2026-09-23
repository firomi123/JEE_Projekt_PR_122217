/** Polish date-time formatter, e.g. `23.09.2026, 14:05`. */
const DATE_TIME = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Formats an ISO timestamp for display.
 *
 * @param iso - ISO 8601 timestamp from the API.
 * @returns Local date and time in Polish format.
 */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

/**
 * Formats a byte count with a Polish decimal separator.
 *
 * @param bytes - Size in bytes (non-negative).
 * @returns E.g. `512 B`, `12,3 kB`, `2,4 MB` (1 kB = 1024 B).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} ${units[unit]}`;
}
