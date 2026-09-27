/**
 * Builds the query parameters of a list page after a filter change.
 *
 * Every given parameter is set (an empty string removes it); the page number is
 * removed unless it is one of the changes, so a new filter starts on page 1.
 *
 * Callers pass the *current* URL (`window.location.search`), not React Router's
 * `searchParams`, and navigate with `flushSync`: React Router renders navigations
 * as transitions by default, so a delayed update (the debounced search) that ran
 * before the re-render would build on the previous filters and undo a change made
 * just before it (found by the E2E test `keeps a filter chosen while the search
 * text is still being applied`).
 *
 * @param current - Current query string (with or without the leading `?`).
 * @param changes - Parameters to set; an empty string removes the parameter.
 * @returns New parameters; `current` is not modified.
 */
export function mergeSearchParams(
  current: string,
  changes: Record<string, string>,
): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  if (!('page' in changes)) next.delete('page');
  return next;
}
