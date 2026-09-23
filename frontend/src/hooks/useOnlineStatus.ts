import { useSyncExternalStore } from 'react';

/**
 * Subscribes to the browser's `online` / `offline` events.
 *
 * @param onChange - Called when the connectivity changes.
 * @returns A function that removes the listeners.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * Tells whether the browser currently reports a network connection.
 *
 * @returns `true` when online (`navigator.onLine`), updated on every change.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
